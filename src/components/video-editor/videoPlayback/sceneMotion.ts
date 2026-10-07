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
	/** Active Glass Loupe region: magnify inside a lens; the camera itself stays put. */
	loupe?: SceneLoupeTarget;
};

export type SceneLoupeTarget = {
	/** Lens center (normalized to the video) used when not following the cursor. */
	focus: ZoomFocus;
	/** Full magnification at strength 1. */
	scale: number;
	/** 0..1 eased in/out like a regular zoom. */
	strength: number;
	followCursor: boolean;
};

type Size = { width: number; height: number };

/**
 * Stage and base video mask size, used by "Always keep zoomed in" auto framing.
 * followSpeed: 0 = slow, 0.5 = default, 1 = fast cursor following.
 */
export type AutoFrameViewport = { stageSize: Size; mask: Size; followSpeed?: number };

export const DEFAULT_AUTO_FRAME_FOLLOW_SPEED = 0.5;
const AUTO_FRAME_SMOOTHING_STEP_MS = 100;

/** Slow..fast maps to a 1600..400ms smoothing window (800ms at default). */
export function getAutoFrameSmoothingWindowMs(followSpeed = DEFAULT_AUTO_FRAME_FOLLOW_SPEED) {
	const speed = Math.min(1, Math.max(0, followSpeed));
	return Math.round(800 * 2 ** ((0.5 - speed) * 2));
}

/** Share of the visible area the cursor may reach before the frame is pulled along (0.9..0.5). */
export function getAutoFrameCursorReach(followSpeed = DEFAULT_AUTO_FRAME_FOLLOW_SPEED) {
	const speed = Math.min(1, Math.max(0, followSpeed));
	return 0.7 + (0.5 - speed) * 0.4;
}

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
	windowMs = getAutoFrameSmoothingWindowMs(),
): ZoomFocus | null {
	if (!samples || samples.length === 0) return null;
	let sumX = 0;
	let sumY = 0;
	let sumW = 0;
	for (
		let offset = -windowMs;
		offset <= windowMs;
		offset += AUTO_FRAME_SMOOTHING_STEP_MS
	) {
		const point = interpolateCursorPosition(samples, timeMs + offset);
		if (!point) continue;
		const weight = windowMs + AUTO_FRAME_SMOOTHING_STEP_MS - Math.abs(offset);
		sumX += point.cx * weight;
		sumY += point.cy * weight;
		sumW += weight;
	}
	return sumW > 0 ? { cx: sumX / sumW, cy: sumY / sumW } : null;
}

/**
 * The smoothed focus lags a fast cursor; pull the frame along so the real cursor
 * always stays inside the inner part (70% at default speed) of the visible area.
 */
export function keepCursorInView(
	focus: ZoomFocus,
	cursor: { cx: number; cy: number },
	scale: number,
	{ stageSize, mask, followSpeed }: AutoFrameViewport,
): ZoomFocus {
	const reachRatio = getAutoFrameCursorReach(followSpeed);
	const follow = (value: number, target: number, stage: number, size: number) => {
		const reach = (stage / (2 * scale * size)) * reachRatio;
		return Math.min(target + reach, Math.max(target - reach, value));
	};
	return {
		cx: follow(focus.cx, cursor.cx, stageSize.width, mask.width),
		cy: follow(focus.cy, cursor.cy, stageSize.height, mask.height),
	};
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

type SceneZoomTargetInput = Parameters<typeof resolveCameraZoomTarget>[0];

/** Resolve the camera target (and Glass Loupe) for a media timestamp, independent of renderer. */
export function resolveSceneZoomTarget(input: SceneZoomTargetInput): SceneZoomTarget {
	if (!input.zoomRegions.some((region) => region.loupe)) return resolveCameraZoomTarget(input);
	const target = resolveCameraZoomTarget({
		...input,
		zoomRegions: input.zoomRegions.filter((region) => !region.loupe),
	});
	const { region, strength } = findDominantRegion(
		input.zoomRegions.filter((region) => region.loupe),
		input.timeMs,
		{ zoomInDurationMs: input.zoomInDurationMs, zoomOutDurationMs: input.zoomOutDurationMs },
	);
	if (region && strength > 0) {
		target.loupe = {
			focus: region.focus,
			scale: ZOOM_DEPTH_SCALES[region.depth],
			strength,
			followCursor: region.mode !== "manual" && !input.zoomClassicMode,
		};
	}
	return target;
}

function resolveCameraZoomTarget({
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
		const smoothed = getSmoothedCursorFocus(
			cursorTelemetry,
			cursorTimeMs,
			getAutoFrameSmoothingWindowMs(autoFrameViewport.followSpeed),
		);
		const rawCursor = cursorTelemetry?.length
			? interpolateCursorPosition(cursorTelemetry, cursorTimeMs)
			: null;
		const cursorFocus =
			(smoothed && rawCursor
				? keepCursorInView(smoothed, rawCursor, scale, autoFrameViewport)
				: smoothed) ??
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
