// Screen Studio–style extras shared by the editor preview and every exporter:
// keyboard-shortcut pills, click sound, idle-cursor hiding and per-clip cursor hiding.
import {
	type AudioRegion,
	type ClipRegion,
	type CursorTelemetryPoint,
	getClipSourceEndMs,
	getClipSourceStartMs,
	mapSourceTimeToTimelineTime,
} from "./types";
import { KENNEY_CLICK_SOUNDS } from "./clickSoundAssets";
import type { TimelineShortcutBlock } from "./timeline/core/timelineTypes";

export type ShortcutOverlayPosition = "bottom-center" | "bottom-left" | "bottom-right";

export const CLICK_SOUND_IDS = ["default", "soft", "crisp", "tick", "tap", "toggle"] as const;
export type ClickSoundId = (typeof CLICK_SOUND_IDS)[number];

export interface CursorExtrasSettings {
	/** Screen Studio "Show shortcuts". */
	showShortcuts: boolean;
	/** Screen Studio "Show single key shortcuts" (Esc, Enter, arrows… without a modifier). */
	showSingleKeyShortcuts: boolean;
	shortcutsPosition: ShortcutOverlayPosition;
	/** Screen Studio "Shortcut labels size" multiplier. */
	shortcutsSize: number;
	clickSound: boolean;
	clickSoundVolume: number;
	/** Screen Studio "Click sound" effect picker. */
	clickSoundType: ClickSoundId;
	/** Screen Studio "Hide cursor if it's not moving". */
	hideIdleCursor: boolean;
	idleCursorDelaySec: number;
}

export const DEFAULT_CURSOR_EXTRAS: CursorExtrasSettings = {
	showShortcuts: false,
	showSingleKeyShortcuts: false,
	shortcutsPosition: "bottom-center",
	shortcutsSize: 1,
	clickSound: false,
	clickSoundVolume: 0.5,
	clickSoundType: "default",
	hideIdleCursor: false,
	idleCursorDelaySec: 2,
};

/** Mirrors electron/ipc/cursor/keystrokes.ts `<video>.keys.json` samples. */
export type KeystrokeSample = {
	timeMs: number;
	key: string;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
};

export type TimeRange = { startMs: number; endMs: number };

/** Everything the frame renderers need, bundled so exporters pass one field. */
export interface CursorExtrasRenderOptions {
	settings: CursorExtrasSettings;
	keystrokes: KeystrokeSample[];
	/** Source-time ranges where the cursor is hidden (clips with "Hide cursor"). */
	hiddenRanges: TimeRange[];
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function finiteOr(value: unknown, fallback: number) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeCursorExtras(raw: unknown): CursorExtrasSettings {
	const value = (raw && typeof raw === "object" ? raw : {}) as Partial<CursorExtrasSettings>;
	const d = DEFAULT_CURSOR_EXTRAS;
	const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
	return {
		showShortcuts: bool(value.showShortcuts, d.showShortcuts),
		showSingleKeyShortcuts: bool(value.showSingleKeyShortcuts, d.showSingleKeyShortcuts),
		shortcutsPosition:
			value.shortcutsPosition === "bottom-left" || value.shortcutsPosition === "bottom-right"
				? value.shortcutsPosition
				: "bottom-center",
		shortcutsSize: clamp(finiteOr(value.shortcutsSize, d.shortcutsSize), 0.5, 2),
		clickSound: bool(value.clickSound, d.clickSound),
		clickSoundVolume: clamp(finiteOr(value.clickSoundVolume, d.clickSoundVolume), 0, 1),
		clickSoundType: CLICK_SOUND_IDS.includes(value.clickSoundType as ClickSoundId)
			? (value.clickSoundType as ClickSoundId)
			: d.clickSoundType,
		hideIdleCursor: bool(value.hideIdleCursor, d.hideIdleCursor),
		idleCursorDelaySec: clamp(
			finiteOr(value.idleCursorDelaySec, d.idleCursorDelaySec),
			0.5,
			10,
		),
	};
}

export function normalizeKeystrokeSamples(raw: unknown): KeystrokeSample[] {
	const samples = (raw as { samples?: unknown })?.samples ?? raw;
	if (!Array.isArray(samples)) return [];
	return samples
		.filter(
			(s): s is KeystrokeSample =>
				Boolean(s) &&
				typeof s.timeMs === "number" &&
				Number.isFinite(s.timeMs) &&
				typeof s.key === "string",
		)
		.map((s) => ({
			timeMs: s.timeMs,
			key: s.key,
			ctrl: Boolean(s.ctrl),
			alt: Boolean(s.alt),
			shift: Boolean(s.shift),
			meta: Boolean(s.meta),
		}))
		.sort((a, b) => a.timeMs - b.timeMs);
}

// ---------------------------------------------------------------------------
// Cursor hidden per clip ("Hide cursor" on a timeline clip, like Screen Studio's
// right-click → hide cursor on a fragment).

export function getHiddenCursorRanges(clips: ClipRegion[] | undefined): TimeRange[] {
	return (clips ?? [])
		.filter((clip) => clip.hideCursor)
		.map((clip) => ({ startMs: getClipSourceStartMs(clip), endMs: getClipSourceEndMs(clip) }));
}

// ---------------------------------------------------------------------------
// Cursor visibility (idle hide + hidden ranges)

const IDLE_FADE_OUT_MS = 300;
const IDLE_FADE_IN_MS = 150;
const HIDDEN_RANGE_FADE_MS = 120;
const MOVE_EPSILON = 0.0015;

const activityCache = new WeakMap<CursorTelemetryPoint[], number[]>();

/** Times where the cursor moved or clicked; cached per telemetry array. */
function getActivityTimes(samples: CursorTelemetryPoint[]): number[] {
	const cached = activityCache.get(samples);
	if (cached) return cached;
	const times: number[] = [];
	for (let i = 0; i < samples.length; i += 1) {
		const sample = samples[i];
		const prev = samples[i - 1];
		const moved =
			!prev ||
			Math.abs(sample.cx - prev.cx) > MOVE_EPSILON ||
			Math.abs(sample.cy - prev.cy) > MOVE_EPSILON;
		const interacted =
			sample.interactionType !== undefined && sample.interactionType !== "move";
		if (moved || interacted) times.push(sample.timeMs);
	}
	activityCache.set(samples, times);
	return times;
}

/** Index of the last element <= value, or -1. */
function lastIndexAtOrBefore(sorted: number[], value: number) {
	let lo = 0;
	let hi = sorted.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid] <= value) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

export function getCursorVisibility(
	samples: CursorTelemetryPoint[],
	timeMs: number,
	idleHideMs: number,
	hiddenRanges: TimeRange[],
): { alpha: number; scale: number } {
	let alpha = 1;
	if (idleHideMs > 0 && samples.length > 0) {
		const times = getActivityTimes(samples);
		const index = lastIndexAtOrBefore(times, timeMs);
		const lastActivity = index >= 0 ? times[index] : samples[0].timeMs;
		const nextActivity = times[index + 1];
		const idleMs = timeMs - lastActivity;
		let idleAlpha = idleMs <= idleHideMs ? 1 : 1 - (idleMs - idleHideMs) / IDLE_FADE_OUT_MS;
		// Fade back in just before the cursor starts moving again.
		if (nextActivity !== undefined && nextActivity - timeMs < IDLE_FADE_IN_MS) {
			idleAlpha = Math.max(idleAlpha, 1 - (nextActivity - timeMs) / IDLE_FADE_IN_MS);
		}
		alpha = clamp(idleAlpha, 0, 1);
	}
	for (const range of hiddenRanges) {
		const distance =
			timeMs < range.startMs
				? range.startMs - timeMs
				: timeMs > range.endMs
					? timeMs - range.endMs
					: 0;
		alpha = Math.min(alpha, clamp(distance / HIDDEN_RANGE_FADE_MS, 0, 1));
	}
	// The cursor shrinks a little as it fades, like Screen Studio's idle hide.
	return { alpha, scale: 0.6 + 0.4 * alpha };
}

// ---------------------------------------------------------------------------
// Keyboard shortcut pill

const SHORTCUT_HOLD_MS = 1000;
const SHORTCUT_APPEAR_MS = 140;
const SHORTCUT_DISAPPEAR_MS = 220;

export function isSingleKeyShortcut(sample: KeystrokeSample) {
	return !sample.ctrl && !sample.alt && !sample.meta;
}

export function getShortcutKeycaps(sample: KeystrokeSample): string[] {
	const caps: string[] = [];
	if (sample.ctrl) caps.push("Ctrl");
	if (sample.alt) caps.push("Alt");
	if (sample.shift) caps.push("Shift");
	if (sample.meta) caps.push("Win");
	caps.push(sample.key);
	return caps;
}

export function getShortcutLabel(sample: KeystrokeSample) {
	return getShortcutKeycaps(sample).join(" + ");
}

/** Shortcuts the user switched off on the shortcuts track (keyed by sample time). */
export function filterEnabledKeystrokes(
	keystrokes: KeystrokeSample[],
	disabledTimes: number[] | undefined,
): KeystrokeSample[] {
	if (!disabledTimes?.length) return keystrokes;
	const disabled = new Set(disabledTimes);
	return keystrokes.filter((sample) => !disabled.has(sample.timeMs));
}

/** Shortcut blocks in timeline time; hidden when "Show shortcuts" is off, like Screen Studio. */
export function buildShortcutBlocks(
	keystrokes: KeystrokeSample[],
	disabledTimes: number[],
	clips: ClipRegion[],
	settings: CursorExtrasSettings,
): TimelineShortcutBlock[] {
	if (!settings.showShortcuts) return [];
	const disabled = new Set(disabledTimes);
	const visible = keystrokes.filter(
		(sample) => settings.showSingleKeyShortcuts || !isSingleKeyShortcut(sample),
	);
	const toTimeline = (ms: number) =>
		clips.length > 0 ? mapSourceTimeToTimelineTime(ms, clips) : ms;
	const blocks: TimelineShortcutBlock[] = [];
	visible.forEach((sample, index) => {
		const inClip =
			clips.length === 0 ||
			clips.some(
				(clip) =>
					sample.timeMs >= getClipSourceStartMs(clip) &&
					sample.timeMs < getClipSourceEndMs(clip),
			);
		if (!inClip) return;
		const next = visible[index + 1];
		const endSource = Math.min(
			sample.timeMs + SHORTCUT_HOLD_MS,
			next ? Math.max(next.timeMs, sample.timeMs + 1) : Infinity,
		);
		const start = toTimeline(sample.timeMs);
		blocks.push({
			timeMs: sample.timeMs,
			start,
			end: Math.max(start + 1, toTimeline(endSource)),
			label: getShortcutLabel(sample),
			disabled: disabled.has(sample.timeMs),
		});
	});
	return blocks;
}

export type ActiveShortcut = {
	caps: string[];
	alpha: number;
	scale: number;
	/** 0 = resting, 1 = fully lowered (entry/exit slide). */
	drop: number;
};

export function getActiveShortcut(
	keystrokes: KeystrokeSample[],
	timeMs: number,
	settings: CursorExtrasSettings,
): ActiveShortcut | null {
	if (!settings.showShortcuts || keystrokes.length === 0) return null;
	let active: KeystrokeSample | null = null;
	let next: KeystrokeSample | null = null;
	for (let i = keystrokes.length - 1; i >= 0; i -= 1) {
		const sample = keystrokes[i];
		if (!settings.showSingleKeyShortcuts && isSingleKeyShortcut(sample)) continue;
		if (sample.timeMs > timeMs) {
			next = sample;
			continue;
		}
		active = sample;
		break;
	}
	if (!active) return null;
	const age = timeMs - active.timeMs;
	// A newer shortcut replaces this one; otherwise it holds ~1s.
	const endMs = Math.min(SHORTCUT_HOLD_MS, next ? next.timeMs - active.timeMs : SHORTCUT_HOLD_MS);
	if (age >= endMs) return null;
	const appear = clamp(age / SHORTCUT_APPEAR_MS, 0, 1);
	const disappear =
		next && next.timeMs - active.timeMs < SHORTCUT_HOLD_MS
			? 1
			: clamp((endMs - age) / SHORTCUT_DISAPPEAR_MS, 0, 1);
	const t = Math.min(appear, disappear);
	const eased = 1 - (1 - t) ** 3;
	return {
		caps: getShortcutKeycaps(active),
		alpha: eased,
		scale: 0.9 + 0.1 * eased,
		drop: 1 - eased,
	};
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/**
 * Draws the shortcut pill (dark rounded container holding one keycap per key)
 * onto a canvas covering the whole output frame.
 */
export function drawShortcutOverlay(
	ctx: CanvasRenderingContext2D,
	keystrokes: KeystrokeSample[],
	timeMs: number,
	frameWidth: number,
	frameHeight: number,
	settings: CursorExtrasSettings,
): boolean {
	const active = getActiveShortcut(keystrokes, timeMs, settings);
	if (!active) return false;

	const unit = Math.min(frameWidth, frameHeight * (16 / 9)) / 1920;
	const fontSize = 34 * unit * settings.shortcutsSize;
	const capPadX = fontSize * 0.5;
	const capHeight = fontSize * 1.6;
	const gap = fontSize * 0.3;
	const pillPad = fontSize * 0.35;

	ctx.save();
	ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Inter, system-ui, sans-serif`;
	const capWidths = active.caps.map((cap) =>
		Math.max(capHeight, ctx.measureText(cap).width + capPadX * 2),
	);
	const pillWidth =
		capWidths.reduce((sum, w) => sum + w, 0) + gap * (capWidths.length - 1) + pillPad * 2;
	const pillHeight = capHeight + pillPad * 2;
	const marginX = frameWidth * 0.04;
	const marginBottom = frameHeight * 0.06;
	const centerX =
		settings.shortcutsPosition === "bottom-left"
			? marginX + pillWidth / 2
			: settings.shortcutsPosition === "bottom-right"
				? frameWidth - marginX - pillWidth / 2
				: frameWidth / 2;
	const centerY = frameHeight - marginBottom - pillHeight / 2 + active.drop * fontSize * 0.6;

	ctx.globalAlpha = active.alpha;
	ctx.translate(centerX, centerY);
	ctx.scale(active.scale, active.scale);
	ctx.translate(-pillWidth / 2, -pillHeight / 2);

	ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
	ctx.shadowBlur = fontSize * 0.8;
	ctx.shadowOffsetY = fontSize * 0.15;
	ctx.fillStyle = "rgba(24, 24, 27, 0.86)";
	roundRect(ctx, 0, 0, pillWidth, pillHeight, pillHeight * 0.32);
	ctx.fill();
	ctx.shadowColor = "transparent";

	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	let x = pillPad;
	active.caps.forEach((cap, index) => {
		const w = capWidths[index];
		ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
		roundRect(ctx, x, pillPad, w, capHeight, capHeight * 0.24);
		ctx.fill();
		ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
		ctx.lineWidth = Math.max(1, fontSize * 0.04);
		ctx.stroke();
		ctx.fillStyle = "#ffffff";
		ctx.fillText(cap, x + w / 2, pillPad + capHeight / 2 + fontSize * 0.04);
		x += w + gap;
	});
	ctx.restore();
	return true;
}

// ---------------------------------------------------------------------------
// Click sound

const CLICK_SOUND_SAMPLE_RATE = 48_000;
const CLICK_SOUND_DURATION_MS = 60;

function isClickSample(sample: CursorTelemetryPoint) {
	return (
		sample.interactionType === "click" ||
		sample.interactionType === "double-click" ||
		sample.interactionType === "right-click" ||
		sample.interactionType === "middle-click"
	);
}

export function getClickTimes(samples: CursorTelemetryPoint[]): number[] {
	return samples.filter(isClickSample).map((sample) => sample.timeMs);
}

/** Short mouse "tick": a damped 2.4 kHz partial over a fast-decaying noise burst. */
export function synthesizeClickSamples(
	sampleRate = CLICK_SOUND_SAMPLE_RATE,
): Float32Array<ArrayBuffer> {
	const length = Math.round((sampleRate * CLICK_SOUND_DURATION_MS) / 1000);
	const out = new Float32Array(length);
	let seed = 1234567;
	for (let i = 0; i < length; i += 1) {
		const t = i / sampleRate;
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		const noise = (seed / 0x7fffffff) * 2 - 1;
		const tone = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 90);
		const body = Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 60);
		out[i] = (noise * Math.exp(-t * 400) * 0.5 + tone * 0.45 + body * 0.25) * 0.9;
	}
	return out;
}

let clickSoundDataUrl: string | null = null;

/** Data URL for the chosen click (synthesized "default" or a bundled CC0 sample). */
export function getClickSoundDataUrl(id: ClickSoundId = "default"): string {
	if (id !== "default") return KENNEY_CLICK_SOUNDS[id].dataUrl;
	if (clickSoundDataUrl) return clickSoundDataUrl;
	const pcm = synthesizeClickSamples();
	const bytes = new Uint8Array(44 + pcm.length * 2);
	const view = new DataView(bytes.buffer);
	const writeText = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
	};
	writeText(0, "RIFF");
	view.setUint32(4, 36 + pcm.length * 2, true);
	writeText(8, "WAVE");
	writeText(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, CLICK_SOUND_SAMPLE_RATE, true);
	view.setUint32(28, CLICK_SOUND_SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeText(36, "data");
	view.setUint32(40, pcm.length * 2, true);
	pcm.forEach((value, i) => view.setInt16(44 + i * 2, clamp(value, -1, 1) * 0x7fff, true));
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
	clickSoundDataUrl = `data:audio/wav;base64,${btoa(binary)}`;
	return clickSoundDataUrl;
}

/** One short audio region per click, in the exporter's audio-region time base. */
export function buildClickSoundRegions(
	samples: CursorTelemetryPoint[],
	clips: ClipRegion[],
	settings: CursorExtrasSettings,
): AudioRegion[] {
	if (!settings.clickSound || settings.clickSoundVolume <= 0) return [];
	const audioPath = getClickSoundDataUrl(settings.clickSoundType);
	const durationMs =
		settings.clickSoundType === "default"
			? CLICK_SOUND_DURATION_MS
			: KENNEY_CLICK_SOUNDS[settings.clickSoundType].durationMs;
	const regions: AudioRegion[] = [];
	for (const sourceMs of getClickTimes(samples)) {
		// With clips, audio regions live on the timeline; skip clicks that were cut out.
		const inClip =
			clips.length === 0 ||
			clips.some(
				(clip) =>
					sourceMs >= getClipSourceStartMs(clip) && sourceMs < getClipSourceEndMs(clip),
			);
		if (!inClip) continue;
		const startMs = clips.length > 0 ? mapSourceTimeToTimelineTime(sourceMs, clips) : sourceMs;
		regions.push({
			id: `click-sound-${regions.length}`,
			startMs,
			endMs: startMs + durationMs,
			audioPath,
			volume: settings.clickSoundVolume,
		});
	}
	return regions;
}

let previewAudioContext: AudioContext | null = null;
const previewClickBuffers = new Map<ClickSoundId, Promise<AudioBuffer | null>>();

function getPreviewClickBuffer(ctx: AudioContext, id: ClickSoundId) {
	let pending = previewClickBuffers.get(id);
	if (!pending) {
		pending =
			id === "default"
				? Promise.resolve().then(() => {
						const pcm = synthesizeClickSamples(ctx.sampleRate);
						const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
						buffer.copyToChannel(pcm, 0);
						return buffer;
					})
				: fetch(getClickSoundDataUrl(id))
						.then((response) => response.arrayBuffer())
						.then((bytes) => ctx.decodeAudioData(bytes))
						.catch((error) => {
							console.warn("Click sound decode failed:", error);
							return null;
						});
		previewClickBuffers.set(id, pending);
	}
	return pending;
}

/** Plays the click in the editor preview (also used to audition a sound when picked). */
export function playPreviewClickSound(volume: number, id: ClickSoundId = "default") {
	if (typeof AudioContext === "undefined" || volume <= 0) return;
	try {
		previewAudioContext ??= new AudioContext();
		const ctx = previewAudioContext;
		void ctx.resume();
		void getPreviewClickBuffer(ctx, id).then((buffer) => {
			if (!buffer) return;
			const gain = ctx.createGain();
			gain.gain.value = volume;
			gain.connect(ctx.destination);
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			source.connect(gain);
			source.start();
		});
	} catch (error) {
		console.warn("Click sound preview failed:", error);
	}
}
