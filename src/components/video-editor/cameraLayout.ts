import { listTranscriptWords } from "./transcriptEdit";
import type {
	CaptionCue,
	CropRegion,
	CursorTelemetryPoint,
	WebcamOverlaySettings,
	WebcamPositionPreset,
} from "./types";
import {
	getWebcamCornerRadiusPx,
	getWebcamOverlayDimensionsPx,
	getWebcamOverlayPosition,
	scaleWebcamOverlayPixels,
} from "./webcamOverlay";

/**
 * Screen Studio camera layouts. "default" is the overlay bubble used outside any
 * layout range; ranges on the Layout track switch to camera fullscreen, split screen
 * or screen only (camera hidden). Shared by preview and export so both match.
 */
export type CameraLayoutKind = "default" | "fullscreen" | "split" | "hidden";

export interface CameraLayoutRegion {
	id: string;
	/** Timeline ms, same base as zoom regions. */
	startMs: number;
	endMs: number;
	layout: CameraLayoutKind;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CameraFrame {
	/** Transform applied to the whole screen composition (scale about the origin, then translate). */
	screen: { scale: number; x: number; y: number };
	/** Area the screen composition may draw into (zoomed content is clipped to it). */
	screenClip: Rect;
	camera: Rect;
	radius: number;
	opacity: number;
}

export const CAMERA_LAYOUT_TRANSITION_MS = 600;
export const CAMERA_AVOID_TRANSITION_MS = 500;
export const SILENCE_THRESHOLD_MS = 1_000;
const SILENCE_PAD_MS = 200;
const SILENCE_FADE_MS = 300;
/** Share of the main axis given to the screen in split screen. */
const SPLIT_SCREEN_SHARE = 2 / 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => {
	const c = clamp01(t);
	return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
	x: lerp(a.x, b.x, t),
	y: lerp(a.y, b.y, t),
	width: lerp(a.width, b.width, t),
	height: lerp(a.height, b.height, t),
});

export function sortCameraLayoutRegions(regions: CameraLayoutRegion[] | undefined) {
	return [...(regions ?? [])]
		.filter((r) => r.endMs > r.startMs)
		.sort((a, b) => a.startMs - b.startMs);
}

/** Layout before → layout now, and eased progress of the switch at `timeMs`. */
export function getCameraLayoutMix(
	regions: CameraLayoutRegion[] | undefined,
	timeMs: number,
	transitionMs = CAMERA_LAYOUT_TRANSITION_MS,
): { from: CameraLayoutKind; to: CameraLayoutKind; progress: number } {
	const sorted = sortCameraLayoutRegions(regions);
	const layoutAt = (t: number): CameraLayoutKind =>
		sorted.find((r) => t >= r.startMs && t < r.endMs)?.layout ?? "default";
	const current = sorted.find((r) => timeMs >= r.startMs && timeMs < r.endMs);
	let changedAt: number;
	if (current) {
		changedAt = current.startMs;
	} else {
		const ended = sorted.filter((r) => r.endMs <= timeMs);
		if (ended.length === 0) return { from: "default", to: "default", progress: 1 };
		changedAt = Math.max(...ended.map((r) => r.endMs));
	}
	// ponytail: a range shorter than the transition starts from the previous layout's
	// final pose, not its half-finished one; nest the mix if that ever looks jumpy.
	const from = layoutAt(changedAt - 1);
	const to = layoutAt(timeMs);
	return { from, to, progress: from === to ? 1 : easeInOut((timeMs - changedAt) / transitionMs) };
}

/** Screen box + camera panel for split screen: side by side, stacked on vertical canvases. */
export function getSplitLayout(canvas: { width: number; height: number }, mask: Rect, margin: number) {
	const horizontal = canvas.width >= canvas.height;
	const main = horizontal ? canvas.width : canvas.height;
	const cross = horizontal ? canvas.height : canvas.width;
	const maskMain = Math.max(1, horizontal ? mask.width : mask.height);
	const maskCross = Math.max(1, horizontal ? mask.height : mask.width);
	const available = Math.max(1, main - margin * 3);
	const scale = Math.min((available * SPLIT_SCREEN_SHARE) / maskMain, (cross - margin * 2) / maskCross);
	const screenMain = maskMain * scale;
	const screenCross = maskCross * scale;
	const cameraMain = available - screenMain;
	const crossStart = (cross - screenCross) / 2;
	// Mask origin in canvas space after the screen transform.
	const screenStart = margin;
	const cameraStart = screenStart + screenMain + margin;
	const maskX = horizontal ? screenStart : crossStart;
	const maskY = horizontal ? crossStart : screenStart;
	const screen = { scale, x: maskX - mask.x * scale, y: maskY - mask.y * scale };
	const camera: Rect = horizontal
		? { x: cameraStart, y: crossStart, width: cameraMain, height: screenCross }
		: { x: crossStart, y: cameraStart, width: screenCross, height: cameraMain };
	const clipMain = cameraStart - margin / 2;
	const screenClip: Rect = horizontal
		? { x: 0, y: 0, width: clipMain, height: canvas.height }
		: { x: 0, y: 0, width: canvas.width, height: clipMain };
	return { screen, camera, screenClip, radius: Math.min(camera.width, camera.height) * 0.06 };
}

function getFrameForLayout(
	kind: CameraLayoutKind,
	params: {
		canvas: { width: number; height: number };
		mask: Rect;
		bubble: Rect;
		bubbleRadius: number;
		bubbleOpacity: number;
		margin: number;
	},
): CameraFrame {
	const { canvas, bubble, bubbleRadius } = params;
	const full: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
	const identity = { scale: 1, x: 0, y: 0 };
	switch (kind) {
		case "fullscreen":
			return { screen: identity, screenClip: full, camera: full, radius: 0, opacity: 1 };
		case "split":
			return { ...getSplitLayout(canvas, params.mask, params.margin), opacity: 1 };
		case "hidden":
			return { screen: identity, screenClip: full, camera: bubble, radius: bubbleRadius, opacity: 0 };
		default:
			return {
				screen: identity,
				screenClip: full,
				camera: bubble,
				radius: bubbleRadius,
				opacity: params.bubbleOpacity,
			};
	}
}

export function resolveCameraFrame(params: {
	canvas: { width: number; height: number };
	mask: Rect;
	bubble: Rect;
	bubbleRadius: number;
	/** Hide-during-silence visibility of the overlay bubble (default layout only). */
	bubbleOpacity: number;
	margin: number;
	mix: { from: CameraLayoutKind; to: CameraLayoutKind; progress: number };
}): CameraFrame {
	const a = getFrameForLayout(params.mix.from, params);
	const b = getFrameForLayout(params.mix.to, params);
	const t = params.mix.progress;
	return {
		screen: {
			scale: lerp(a.screen.scale, b.screen.scale, t),
			x: lerp(a.screen.x, b.screen.x, t),
			y: lerp(a.screen.y, b.screen.y, t),
		},
		screenClip: lerpRect(a.screenClip, b.screenClip, t),
		camera: lerpRect(a.camera, b.camera, t),
		radius: lerp(a.radius, b.radius, t),
		opacity: lerp(a.opacity, b.opacity, t),
	};
}

export function isIdentityCameraFrame(frame: CameraFrame, canvas: { width: number; height: number }) {
	return (
		Math.abs(frame.screen.scale - 1) < 1e-4 &&
		Math.abs(frame.screen.x) < 0.01 &&
		Math.abs(frame.screen.y) < 0.01 &&
		frame.screenClip.width >= canvas.width - 0.01 &&
		frame.screenClip.height >= canvas.height - 0.01
	);
}

// ---------- Hide during silence ----------

/** Source-time ranges with no speech longer than the threshold (open-ended at the end). */
export function getSilentRanges(
	cues: CaptionCue[] | undefined,
	thresholdMs = SILENCE_THRESHOLD_MS,
): { startMs: number; endMs: number }[] {
	const words = listTranscriptWords(cues ?? []);
	if (words.length === 0) return [];
	const ranges: { startMs: number; endMs: number }[] = [];
	let lastEnd = 0;
	let first = true;
	for (const word of words) {
		if (word.startMs - lastEnd > thresholdMs) {
			// Leading silence starts at 0 with no fade-out pad.
			ranges.push({ startMs: first ? -SILENCE_FADE_MS - SILENCE_PAD_MS : lastEnd, endMs: word.startMs });
		}
		lastEnd = Math.max(lastEnd, word.endMs);
		first = false;
	}
	ranges.push({ startMs: lastEnd, endMs: Number.POSITIVE_INFINITY });
	return ranges;
}

/** 1 = camera shown, 0 = hidden; fades out after speech stops and back in just before it resumes. */
export function getSpeechVisibility(silentRanges: { startMs: number; endMs: number }[], timeMs: number) {
	for (const range of silentRanges) {
		const start = range.startMs + SILENCE_PAD_MS;
		const end = range.endMs - SILENCE_PAD_MS;
		if (timeMs <= start || timeMs >= end) continue;
		const hidden = Math.min(timeMs - start, end - timeMs) / SILENCE_FADE_MS;
		return 1 - easeInOut(hidden);
	}
	return 1;
}

// ---------- Avoid cursor ----------

export interface NormalizedPoint {
	timeMs: number;
	x: number;
	y: number;
}

/** Cursor sample (recording-relative) → canvas-relative 0..1, ignoring zoom. */
export function mapCursorToCanvas(
	cx: number,
	cy: number,
	mask: Rect,
	canvas: { width: number; height: number },
	crop?: CropRegion,
): { x: number; y: number } {
	const c = crop ?? { x: 0, y: 0, width: 1, height: 1 };
	const u = (cx - c.x) / Math.max(1e-6, c.width);
	const v = (cy - c.y) / Math.max(1e-6, c.height);
	return {
		x: (mask.x + u * mask.width) / Math.max(1, canvas.width),
		y: (mask.y + v * mask.height) / Math.max(1, canvas.height),
	};
}

const contains = (r: Rect, p: { x: number; y: number }, pad: number) =>
	p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad;

/**
 * Times the bubble jumps between its home corner and the mirrored corner: whenever the
 * cursor comes within `pad` of where the bubble currently sits (and the other spot is clear).
 * Rects and points are canvas-relative (0..1). The bubble stays put until approached again.
 */
export function getCursorAvoidSwitchTimes(
	points: NormalizedPoint[],
	home: Rect,
	away: Rect,
	pad = 0.04,
): number[] {
	const switches: number[] = [];
	let atHome = true;
	for (const p of points) {
		const current = atHome ? home : away;
		const other = atHome ? away : home;
		if (contains(current, p, pad) && !contains(other, p, pad)) {
			switches.push(p.timeMs);
			atHome = !atHome;
		}
	}
	return switches;
}

/** 0 = at home corner, 1 = at the mirrored corner, eased between. */
export function getCursorAvoidAmount(
	switchTimes: number[],
	timeMs: number,
	transitionMs = CAMERA_AVOID_TRANSITION_MS,
): number {
	let count = 0;
	let last = Number.NEGATIVE_INFINITY;
	for (const t of switchTimes) {
		if (t > timeMs) break;
		count++;
		last = t;
	}
	if (count === 0) return 0;
	const p = easeInOut((timeMs - last) / transitionMs);
	return count % 2 === 1 ? p : 1 - p;
}

/** Corner presets mirror horizontally; others don't move. */
export function getMirroredPreset<T extends string>(preset: T): T | null {
	if (preset.endsWith("-right")) return preset.replace("-right", "-left") as T;
	if (preset.endsWith("-left")) return preset.replace("-left", "-right") as T;
	return null;
}

// ---------- Everything together (preview + export) ----------

export interface CameraFrameCache {
	switchKey?: string;
	switchTimes?: number[];
	cues?: CaptionCue[];
	silentRanges?: { startMs: number; endMs: number }[];
}

export function computeWebcamCameraFrame(params: {
	webcam: WebcamOverlaySettings;
	canvas: { width: number; height: number };
	/** Screen video rect on the canvas before zoom. */
	mask: Rect;
	crop?: CropRegion;
	widthPercent: number;
	heightPercent: number;
	zoomScale: number;
	timelineMs: number;
	cursorMs: number;
	sourceMs: number;
	cursorTelemetry?: CursorTelemetryPoint[];
	cues?: CaptionCue[];
	cache: CameraFrameCache;
}): CameraFrame {
	const { webcam, canvas, mask, cache } = params;
	const margin = scaleWebcamOverlayPixels(webcam.margin ?? 24, canvas.width);
	const dims = (zoomScale: number) =>
		getWebcamOverlayDimensionsPx({
			containerWidth: canvas.width,
			containerHeight: canvas.height,
			widthPercent: params.widthPercent,
			heightPercent: params.heightPercent,
			margin,
			zoomScale,
			reactToZoom: webcam.reactToZoom ?? true,
		});
	const preset: WebcamPositionPreset = webcam.positionPreset ?? webcam.corner;
	const place = (size: { width: number; height: number }, p: WebcamPositionPreset) =>
		getWebcamOverlayPosition({
			containerWidth: canvas.width,
			containerHeight: canvas.height,
			width: size.width,
			height: size.height,
			margin,
			positionPreset: p,
			positionX: webcam.positionX ?? 1,
			positionY: webcam.positionY ?? 1,
			legacyCorner: webcam.corner,
		});

	const size = dims(params.zoomScale);
	let { x, y } = place(size, preset);
	const mirrored = getMirroredPreset(preset);
	if (webcam.avoidCursor !== false && mirrored && params.cursorTelemetry?.length) {
		const base = dims(1);
		const norm = (pos: { x: number; y: number }): Rect => ({
			x: pos.x / canvas.width,
			y: pos.y / canvas.height,
			width: base.width / canvas.width,
			height: base.height / canvas.height,
		});
		const home = norm(place(base, preset));
		const away = norm(place(base, mirrored));
		const key = [canvas.width, canvas.height, mask.x, mask.y, mask.width, mask.height, home.x, home.y, home.width, home.height, away.x, params.cursorTelemetry.length, params.cursorTelemetry[0]?.timeMs]
			.map((v) => Math.round((v ?? 0) * 1000))
			.join(",");
		if (cache.switchKey !== key) {
			const points = params.cursorTelemetry.map((sample) => ({
				timeMs: sample.timeMs,
				...mapCursorToCanvas(sample.cx, sample.cy, mask, canvas, params.crop),
			}));
			cache.switchKey = key;
			cache.switchTimes = getCursorAvoidSwitchTimes(points, home, away);
		}
		const amount = getCursorAvoidAmount(cache.switchTimes ?? [], params.cursorMs);
		if (amount > 0) {
			const awayPos = place(size, mirrored);
			x = lerp(x, awayPos.x, amount);
			y = lerp(y, awayPos.y, amount);
		}
	}

	let bubbleOpacity = 1;
	if (webcam.hideWhenSilent && params.cues?.length) {
		if (cache.cues !== params.cues) {
			cache.cues = params.cues;
			cache.silentRanges = getSilentRanges(params.cues);
		}
		bubbleOpacity = getSpeechVisibility(cache.silentRanges ?? [], params.sourceMs);
	}

	const frame = resolveCameraFrame({
		canvas,
		mask,
		bubble: { x, y, width: size.width, height: size.height },
		bubbleRadius: getWebcamCornerRadiusPx(webcam.roundness ?? 100, size.width, size.height),
		bubbleOpacity,
		margin: margin * 2,
		mix: getCameraLayoutMix(webcam.layoutRegions, params.timelineMs),
	});
	// Clip only while zoomed in: at rest the screen already fits its box, and clipping
	// would cut its drop shadow into a visible seam.
	if (params.zoomScale <= 1.001) {
		frame.screenClip = { x: 0, y: 0, width: canvas.width, height: canvas.height };
	}
	return frame;
}
