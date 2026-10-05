import type { CursorTelemetryPoint, ZoomFocus, ZoomRegion } from "../types";
import { ZOOM_DEPTH_SCALES } from "../types";
import { DEFAULT_FOCUS } from "./constants";
import {
	type CursorFollowCameraState,
	computeCursorFollowFocus,
	SNAP_TO_EDGES_RATIO_AUTO,
} from "./cursorFollowCamera";
import { interpolateCursorPosition } from "./cursorRenderer";
import { findDominantRegion, isInstantZoomAt } from "./zoomRegionUtils";

export type SceneZoomTarget = {
	scale: number;
	focus: ZoomFocus;
	progress: number;
	/** Cut to this target instead of springing toward it. */
	instant?: boolean;
};

type Size = { width: number; height: number };

/** Stage and base video mask size, used by "Always keep zoomed in" auto framing. */
export type AutoFrameViewport = { stageSize: Size; mask: Size };

const AUTO_FRAME_SMOOTHING_WINDOW_MS = 800;
const AUTO_FRAME_SMOOTHING_STEP_MS = 100;

/**
 * Scale that makes the video mask cover the whole stage. Returns 1 when the aspect
 * ratios already match (no reframing needed).
 */
export function getAutoFrameFillScale({ stageSize, mask }: AutoFrameViewport): number {
	if (stageSize.width <= 0 || stageSize.height <= 0 || mask.width <= 0 || mask.height <= 0) {
		return 1;
	}
	const aspectMismatch = stageSize.width / stageSize.height / (mask.width / mask.height);
	if (aspectMismatch > 0.95 && aspectMismatch < 1.05) {
		return 1;
	}
	return Math.max(1, stageSize.width / mask.width, stageSize.height / mask.height);
}

/** Triangle-weighted cursor average around timeMs; stateless so preview and export match. */
export function getSmoothedCursorFocus(
	samples: CursorTelemetryPoint[] | undefined,
	timeMs: number,
): ZoomFocus | null {
	if (!samples || samples.length === 0) return null;
	let sumX = 0;
	let sumY = 0;
	let sumW = 0;
	for (
		let offset = -AUTO_FRAME_SMOOTHING_WINDOW_MS;
		offset <= AUTO_FRAME_SMOOTHING_WINDOW_MS;
		offset += AUTO_FRAME_SMOOTHING_STEP_MS
	) {
		const point = interpolateCursorPosition(samples, timeMs + offset);
		if (!point) continue;
		const weight =
			AUTO_FRAME_SMOOTHING_WINDOW_MS + AUTO_FRAME_SMOOTHING_STEP_MS - Math.abs(offset);
		sumX += point.cx * weight;
		sumY += point.cy * weight;
		sumW += weight;
	}
	return sumW > 0 ? { cx: sumX / sumW, cy: sumY / sumW } : null;
}

/** Keep the scaled mask covering the stage so no background shows while reframed. */
function clampFocusToCover(
	focus: ZoomFocus,
	scale: number,
	{ stageSize, mask }: AutoFrameViewport,
) {
	const clampAxis = (value: number, stage: number, size: number) => {
		const half = stage / (2 * scale * size);
		return half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, value));
	};
	return {
		cx: clampAxis(focus.cx, stageSize.width, mask.width),
		cy: clampAxis(focus.cy, stageSize.height, mask.height),
	};
}

export type PreviewMotionMode = "spring" | "snap" | "preserve";

/**
 * Decide how the preview camera should react to the current transport state.
 * A plain pause must preserve the last composed frame; recomputing the projected
 * target there causes the image to jump as soon as the user presses Space.
 */
export function resolvePreviewMotionMode({
	isPlaying,
	isSeeking,
	shouldSnapPausedFrame,
	zoomClassicMode,
}: {
	isPlaying: boolean;
	isSeeking: boolean;
	shouldSnapPausedFrame: boolean;
	zoomClassicMode: boolean;
}): PreviewMotionMode {
	if (isSeeking || shouldSnapPausedFrame || (isPlaying && zoomClassicMode)) {
		return "snap";
	}

	return isPlaying ? "spring" : "preserve";
}

/** Match export's one-composition-per-media-frame behavior. */
export function shouldComposePreviewFrame({
	motionMode,
	isSeeking = false,
	contentTimeChanged,
	shouldSnapPausedFrame,
}: {
	motionMode: PreviewMotionMode;
	isSeeking?: boolean;
	contentTimeChanged: boolean;
	shouldSnapPausedFrame: boolean;
}): boolean {
	// Do not consume the pending composition against the old decoded image.
	if (isSeeking || motionMode === "preserve") {
		return false;
	}

	return contentTimeChanged || shouldSnapPausedFrame;
}

/** Resolve the camera target for a media timestamp, independent of renderer. */
export function resolveSceneZoomTarget({
	zoomRegions,
	timeMs,
	cursorTimeMs = timeMs,
	connectZooms,
	zoomInDurationMs,
	zoomOutDurationMs,
	zoomClassicMode,
	cursorTelemetry,
	cursorFollowCamera,
	autoFrameViewport,
}: {
	zoomRegions: ZoomRegion[];
	timeMs: number;
	cursorTimeMs?: number;
	connectZooms?: boolean;
	zoomInDurationMs?: number;
	zoomOutDurationMs?: number;
	zoomClassicMode?: boolean;
	cursorTelemetry?: CursorTelemetryPoint[];
	cursorFollowCamera: CursorFollowCameraState;
	autoFrameViewport?: AutoFrameViewport | null;
}): SceneZoomTarget {
	const { region, strength, blendedScale } = findDominantRegion(zoomRegions, timeMs, {
		connectZooms,
		zoomInDurationMs,
		zoomOutDurationMs,
	});
	const activeRegion = region && strength > 0 ? region : null;
	const instant = isInstantZoomAt(zoomRegions, timeMs, activeRegion) || undefined;

	const fillScale = autoFrameViewport ? getAutoFrameFillScale(autoFrameViewport) : 1;
	if (autoFrameViewport && fillScale > 1) {
		// "Always keep zoomed in": crop to the output aspect and follow the cursor.
		const regionScale = activeRegion
			? (blendedScale ?? ZOOM_DEPTH_SCALES[activeRegion.depth])
			: 1;
		const scale = fillScale * (1 + (regionScale - 1) * strength);
		const cursorFocus =
			getSmoothedCursorFocus(cursorTelemetry, cursorTimeMs) ??
			activeRegion?.focus ??
			DEFAULT_FOCUS;
		const focus =
			activeRegion && (activeRegion.mode === "manual" || zoomClassicMode)
				? {
						cx: cursorFocus.cx + (activeRegion.focus.cx - cursorFocus.cx) * strength,
						cy: cursorFocus.cy + (activeRegion.focus.cy - cursorFocus.cy) * strength,
					}
				: cursorFocus;
		return {
			scale,
			focus: clampFocusToCover(focus, scale, autoFrameViewport),
			progress: 1,
			instant,
		};
	}

	if (!region || strength <= 0) {
		return { scale: 1, focus: DEFAULT_FOCUS, progress: 0, instant };
	}

	const scale = blendedScale ?? ZOOM_DEPTH_SCALES[region.depth];
	let focus = region.focus;
	if (
		!zoomClassicMode &&
		region.mode !== "manual" &&
		cursorTelemetry &&
		cursorTelemetry.length > 0
	) {
		focus = computeCursorFollowFocus(
			cursorFollowCamera,
			cursorTelemetry,
			cursorTimeMs,
			scale,
			strength,
			region.focus,
			{ snapToEdgesRatio: SNAP_TO_EDGES_RATIO_AUTO },
		);
	}

	return { scale, focus, progress: strength, instant };
}
