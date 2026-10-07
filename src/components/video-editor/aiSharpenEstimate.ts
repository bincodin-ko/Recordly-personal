import type { ZoomRegion } from "./types";

// Extra export seconds per frame for AI sharpening, measured on the dev PC (RTX 5070,
// 2560x1440 recording, smoke exports). A 2x zoom sends a quarter of the frame to the model;
// an unzoomed frame (whole-video mode) sends all of it.
const ZOOMED_FRAME_SEC = 0.23;
const FULL_FRAME_SEC = 0.4;

/** Estimated extra export time (seconds) for each AI sharpening scope. */
export function estimateAiSharpenSeconds(
	durationSec: number,
	zoomRegions: readonly ZoomRegion[],
	frameRate: number,
): { zoom: number; all: number } {
	const duration = Math.max(0, durationSec || 0);
	const zoomedSec = Math.min(
		duration,
		zoomRegions.reduce(
			(total, region) =>
				total + Math.max(0, Math.min(region.endMs / 1000, duration) - region.startMs / 1000),
			0,
		),
	);
	const zoom = zoomedSec * frameRate * ZOOMED_FRAME_SEC;
	return { zoom, all: zoom + (duration - zoomedSec) * frameRate * FULL_FRAME_SEC };
}
