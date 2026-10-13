import { resolveMediaElementSource } from "@/lib/exporter/localMediaSource";

const FRAME_SECONDS = 0.03;
/** RMS level a 30 ms frame needs to count as voice (room noise sits around -60..-50 dBFS). */
export const SPEECH_DBFS = -45;
/** Total voiced time needed before we call it speech. */
export const MIN_SPEECH_SECONDS = 0.3;
const MAX_DECODE_BYTES = 300 * 1024 * 1024;

/** RMS level per 30 ms frame, in dBFS. */
export function frameLevelsDb(samples: Float32Array, sampleRate: number): number[] {
	const size = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
	const levels: number[] = [];
	for (let start = 0; start + size <= samples.length; start += size) {
		let sum = 0;
		for (let i = start; i < start + size; i++) sum += samples[i] * samples[i];
		const rms = Math.sqrt(sum / size);
		levels.push(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
	}
	return levels;
}

/**
 * Screen Studio opens a recording with "Mute microphone" on when the mic caught no speech.
 * `null` = analysis failed: never mute then.
 */
export function shouldAutoMuteMic(levelsDb: number[] | null): boolean {
	if (!levelsDb || levelsDb.length === 0) return false;
	const voicedFrames = levelsDb.filter((db) => db >= SPEECH_DBFS).length;
	return voicedFrames * FRAME_SECONDS < MIN_SPEECH_SECONDS;
}

/** Decode the mic track and return its frame levels, or null on any failure. */
export async function analyzeMicLevels(resource: string): Promise<number[] | null> {
	let ctx: AudioContext | null = null;
	try {
		const { src } = await resolveMediaElementSource(resource);
		const response = await fetch(src);
		const length = Number(response.headers.get("content-length") ?? 0);
		if (!response.ok || length > MAX_DECODE_BYTES) return null;
		ctx = new AudioContext();
		const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
		if (buffer.length === 0) return null;
		return frameLevelsDb(buffer.getChannelData(0), buffer.sampleRate);
	} catch {
		return null;
	} finally {
		void ctx?.close().catch(() => undefined);
	}
}

// ponytail: module-level marker (one editor window). Thread a ref through if editors ever multiply.
const freshRecordings = new Set<string>();
export function markFreshRecordingForMicCheck(videoPath: string) {
	freshRecordings.add(videoPath);
}
export function takeFreshRecordingMicCheck(videoPath: string | null): boolean {
	return videoPath !== null && freshRecordings.delete(videoPath);
}
