/** Fastest audible scrub, in multiples of normal speed (Screen Studio: faster drag = faster audio). */
export const MAX_SCRUB_RATE = 8;
/** Below this the pointer is considered still: no sound. */
export const MIN_SCRUB_RATE = 0.05;
/** A pause longer than this between two drag samples means the pointer rested. */
export const SCRUB_STALE_WALL_SECONDS = 0.25;
export const SCRUB_GRAIN_WALL_SECONDS = 0.09;

/** Signed playback rate of a drag: media seconds moved per wall-clock second (negative = backward). */
export function scrubRate(deltaMediaSeconds: number, deltaWallSeconds: number): number {
	if (!(deltaWallSeconds > 0) || deltaWallSeconds > SCRUB_STALE_WALL_SECONDS) return 0;
	const rate = deltaMediaSeconds / deltaWallSeconds;
	if (!Number.isFinite(rate)) return 0;
	return Math.max(-MAX_SCRUB_RATE, Math.min(MAX_SCRUB_RATE, rate));
}

export interface ScrubGrain {
	reverse: boolean;
	/** Speed the grain is played at (also pitch, like tape). Kept audible: 0.25..MAX. */
	playbackRate: number;
	/** How much source audio the grain covers. */
	sourceSpanSeconds: number;
}

export function grainForRate(rate: number): ScrubGrain | null {
	const speed = Math.abs(rate);
	if (!(speed >= MIN_SCRUB_RATE)) return null;
	const playbackRate = Math.max(0.25, Math.min(MAX_SCRUB_RATE, speed));
	return {
		reverse: rate < 0,
		playbackRate,
		sourceSpanSeconds: SCRUB_GRAIN_WALL_SECONDS * playbackRate,
	};
}
