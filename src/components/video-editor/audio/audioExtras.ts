import { type AudioRegion, type ClipRegion, getTimelineDurationMs } from "../types";

// Screen Studio-style project audio: microphone audio mode + background music
// (looped under the whole video, auto-ducked while someone is speaking).

export type MicAudioMode = "standard" | "noise-reduction" | "podcast";

export interface BackgroundMusicSettings {
	/** "/music/<file>" for the built-in library, an absolute path for user files, null = off. */
	path: string | null;
	volume: number;
	ducking: boolean;
}

export interface AudioExtrasSettings {
	micMode: MicAudioMode;
	music: BackgroundMusicSettings;
}

export const DEFAULT_AUDIO_EXTRAS: AudioExtrasSettings = {
	micMode: "standard",
	music: { path: null, volume: 0.25, ducking: true },
};

// CC0 tracks from OpenGameArt, bundled under public/music (see THIRD_PARTY_NOTICES.md).
export const BUILTIN_MUSIC_TRACKS = [
	{ id: "chill-lofi", path: "/music/chill-lofi.mp3", label: "Chill Lofi" },
	{ id: "field-of-dreams", path: "/music/field-of-dreams.mp3", label: "Field of Dreams" },
	{ id: "next-to-you", path: "/music/next-to-you.mp3", label: "Next to You" },
	{ id: "bossa", path: "/music/8bit-bossa.mp3", label: "8bit Bossa" },
	{ id: "happy-lullaby", path: "/music/happy-lullaby.mp3", label: "Happy Lullaby" },
] as const;

const MIC_MODES: MicAudioMode[] = ["standard", "noise-reduction", "podcast"];

export function normalizeAudioExtras(value: unknown): AudioExtrasSettings {
	const raw = (value && typeof value === "object" ? value : {}) as Partial<AudioExtrasSettings>;
	const music = (raw.music && typeof raw.music === "object" ? raw.music : {}) as Partial<
		BackgroundMusicSettings
	>;
	const volume = Number(music.volume);
	return {
		micMode: MIC_MODES.includes(raw.micMode as MicAudioMode)
			? (raw.micMode as MicAudioMode)
			: DEFAULT_AUDIO_EXTRAS.micMode,
		music: {
			path: typeof music.path === "string" && music.path.length > 0 ? music.path : null,
			volume: Number.isFinite(volume)
				? Math.max(0, Math.min(1, volume))
				: DEFAULT_AUDIO_EXTRAS.music.volume,
			ducking: typeof music.ducking === "boolean" ? music.ducking : true,
		},
	};
}

export const BACKGROUND_MUSIC_REGION_ID = "__background-music";

/** Export-only audio region that loops the music under the whole timeline. */
export function buildBackgroundMusicRegions(
	settings: AudioExtrasSettings,
	clipRegions: ClipRegion[],
	sourceDurationMs: number,
): AudioRegion[] {
	if (!settings.music.path || settings.music.volume <= 0) return [];
	const endMs = getTimelineDurationMs(
		clipRegions,
		Number.isFinite(sourceDurationMs) ? sourceDurationMs : 0,
	);
	if (endMs <= 0) return [];
	return [
		{
			id: BACKGROUND_MUSIC_REGION_ID,
			startMs: 0,
			endMs,
			audioPath: settings.music.path,
			volume: settings.music.volume,
			loop: true,
			duckUnderSpeech: settings.music.ducking,
		},
	];
}

// ---- Auto-ducking -------------------------------------------------------------

export const DUCK_STEP_SEC = 0.02;
/** Music level while someone speaks (about -12 dB). */
export const DUCK_GAIN = 0.25;
const DUCK_HOLD_STEPS = 15; // keep ducked 300 ms after speech
const DUCK_LOOKAHEAD_STEPS = 5; // start ducking 100 ms before speech
const DUCK_ATTACK_COEF = 1 - Math.exp(-1 / 4); // ~80 ms
const DUCK_RELEASE_COEF = 1 - Math.exp(-1 / 25); // ~500 ms
const FADE_IN_SEC = 0.5;
const FADE_OUT_SEC = 1.5;

/**
 * Speech gate per DUCK_STEP_SEC window in source time. Threshold adapts to the
 * recording's noise floor (10th percentile window level + 12 dB, at least -50 dBFS).
 */
export function computeSpeechGate(
	channels: Float32Array[],
	sampleRate: number,
	startDelaySec = 0,
): Uint8Array {
	const step = Math.max(1, Math.round(sampleRate * DUCK_STEP_SEC));
	const length = channels[0]?.length ?? 0;
	const windows = Math.ceil(length / step);
	const db = new Float32Array(windows);
	for (let w = 0; w < windows; w++) {
		let sum = 0;
		let count = 0;
		for (const data of channels) {
			const end = Math.min(length, (w + 1) * step);
			for (let i = w * step; i < end; i++) sum += data[i] * data[i];
			count += end - w * step;
		}
		db[w] = 10 * Math.log10(sum / Math.max(1, count) + 1e-12);
	}
	const sorted = Array.from(db).sort((a, b) => a - b);
	const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
	const threshold = Math.max(floor + 12, -50);

	const offset = Math.max(0, Math.round(startDelaySec / DUCK_STEP_SEC));
	const gate = new Uint8Array(windows + offset + DUCK_HOLD_STEPS);
	for (let w = 0; w < windows; w++) {
		if (db[w] <= threshold) continue;
		const from = Math.max(0, w + offset - DUCK_LOOKAHEAD_STEPS);
		const to = Math.min(gate.length - 1, w + offset + DUCK_HOLD_STEPS);
		gate.fill(1, from, to + 1);
	}
	return gate;
}

interface SliceLike {
	outputStartMs?: number;
	sourceStartMs: number;
	sourceEndMs: number;
	speed: number;
}

/**
 * Music gain multiplier per DUCK_STEP_SEC of OUTPUT time: ducked where the
 * (source-time) speech gate is on, smoothed, plus a short fade in/out.
 */
export function buildDuckCurve(
	gate: Uint8Array | null,
	slices: SliceLike[],
	outputDurationMs: number,
): Float32Array {
	const steps = Math.max(2, Math.ceil(outputDurationMs / 1000 / DUCK_STEP_SEC) + 1);
	const curve = new Float32Array(steps);
	let g = 1;
	let sliceIndex = 0;
	let runningOutputMs = 0;
	const starts = slices.map((slice) => {
		const start = slice.outputStartMs ?? runningOutputMs;
		runningOutputMs = start + (slice.sourceEndMs - slice.sourceStartMs) / slice.speed;
		return start;
	});
	for (let i = 0; i < steps; i++) {
		const tMs = i * DUCK_STEP_SEC * 1000;
		let speaking = false;
		if (gate) {
			while (
				sliceIndex < slices.length - 1 &&
				tMs >=
					starts[sliceIndex] +
						(slices[sliceIndex].sourceEndMs - slices[sliceIndex].sourceStartMs) /
							slices[sliceIndex].speed
			) {
				sliceIndex++;
			}
			const slice = slices[sliceIndex];
			if (slice && tMs >= starts[sliceIndex]) {
				const sourceMs = slice.sourceStartMs + (tMs - starts[sliceIndex]) * slice.speed;
				if (sourceMs < slice.sourceEndMs) {
					speaking = gate[Math.floor(sourceMs / 1000 / DUCK_STEP_SEC)] === 1;
				}
			}
		}
		const target = speaking ? DUCK_GAIN : 1;
		g += (target - g) * (target < g ? DUCK_ATTACK_COEF : DUCK_RELEASE_COEF);
		const tSec = tMs / 1000;
		const fade = Math.min(1, tSec / FADE_IN_SEC, (outputDurationMs / 1000 - tSec) / FADE_OUT_SEC);
		curve[i] = g * Math.max(0, fade);
	}
	return curve;
}

export function sampleDuckCurve(curve: Float32Array | null, outputSec: number): number {
	if (!curve || curve.length === 0) return 1;
	const index = Math.max(0, Math.min(curve.length - 1, Math.round(outputSec / DUCK_STEP_SEC)));
	return curve[index];
}
