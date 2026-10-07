interface TrackSpan {
	id: string;
	startMs: number;
	endMs: number;
	trackIndex?: number;
}

/**
 * Display track per annotation: keep the stored track when its row is free for that
 * time range, otherwise drop to the lowest row where nothing overlaps, so annotations
 * that share a moment are stacked in separate rows instead of hiding each other.
 */
export function layoutAnnotationTracks(regions: TrackSpan[]): Map<string, number> {
	const placed: TrackSpan[][] = [];
	const result = new Map<string, number>();
	const isFree = (track: number, region: TrackSpan) =>
		!(placed[track] ?? []).some((p) => p.startMs < region.endMs && region.startMs < p.endMs);
	const sorted = [...regions].sort(
		(a, b) => (a.trackIndex ?? 0) - (b.trackIndex ?? 0) || a.startMs - b.startMs,
	);
	for (const region of sorted) {
		const wanted = Math.max(0, Math.floor(region.trackIndex ?? 0));
		let track = wanted;
		if (!isFree(track, region)) {
			track = 0;
			while (!isFree(track, region)) track++;
		}
		(placed[track] ??= []).push(region);
		result.set(region.id, track);
	}
	return result;
}

/** Lowest annotation row with no overlap for a new span. */
export function findFreeAnnotationTrack(regions: TrackSpan[], startMs: number, endMs: number) {
	const tracks = layoutAnnotationTracks([...regions, { id: "__new__", startMs, endMs }]);
	return tracks.get("__new__") ?? 0;
}
