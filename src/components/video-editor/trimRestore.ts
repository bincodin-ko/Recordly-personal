// Screen Studio style "undo trim": a trimmed stretch of the recording shows as a bubble on
// the clip row; restoring it brings the footage back and, when effects sit on the
// neighbouring clips, the restored stretch has to take over one side's effects.
import { packClipSequence } from "./clipSequence";
import { rippleBySource } from "./typingSpeedUp";
import {
	type ClipRegion,
	getClipSourceEndMs,
	getClipSourceStartMs,
	getClipVolume,
	sortClipRegions,
	type ZoomRegion,
} from "./types";

export interface TrimGap {
	id: string;
	/** Trimmed source range. */
	startMs: number;
	endMs: number;
	/** Clip ending right before the gap (in the recording) / starting right after it. */
	beforeClipId: string | null;
	afterClipId: string | null;
}

const MIN_GAP_MS = 20;
// A zoom counts as "reaching" a clip edge when it covers the clip's last/first 300 ms.
const ZOOM_EDGE_MS = 300;

export function findTrimGaps(clips: ClipRegion[], sourceDurationMs: number): TrimGap[] {
	const bySource = [...clips].sort((a, b) => getClipSourceStartMs(a) - getClipSourceStartMs(b));
	const gaps: TrimGap[] = [];
	let cursor = 0;
	let prev: ClipRegion | null = null;
	const push = (end: number, next: ClipRegion | null) => {
		if (end - cursor >= MIN_GAP_MS) {
			gaps.push({
				id: `gap-${cursor}-${end}`,
				startMs: cursor,
				endMs: end,
				beforeClipId: prev?.id ?? null,
				afterClipId: next?.id ?? null,
			});
		}
	};
	for (const clip of bySource) {
		push(getClipSourceStartMs(clip), clip);
		cursor = Math.max(cursor, getClipSourceEndMs(clip));
		prev = clip;
	}
	push(sourceDurationMs, null);
	return gaps;
}

type Side = "before" | "after";

function clipEffectKey(clip: ClipRegion): string {
	return `${clip.speed}|${getClipVolume(clip)}|${clip.muted ? 1 : 0}|${clip.hideCursor ? 1 : 0}|${clip.disableSmoothCursor ? 1 : 0}`;
}

function zoomTouchesEdge(zooms: ZoomRegion[], clip: ClipRegion, side: Side): boolean {
	return zooms.some((z) =>
		side === "before"
			? z.endMs > clip.endMs - ZOOM_EDGE_MS && z.startMs < clip.endMs
			: z.startMs < clip.startMs + ZOOM_EDGE_MS && z.endMs > clip.startMs,
	);
}

/** Effects a neighbour would pass into the restored stretch (empty = nothing to merge). */
export function neighbourEffects(clip: ClipRegion | undefined, zooms: ZoomRegion[], side: Side): string[] {
	if (!clip) return [];
	const effects: string[] = [];
	if (clip.speed !== 1) effects.push("speed");
	if (getClipVolume(clip) !== 1) effects.push("volume");
	if (clip.muted) effects.push("muted");
	if (clip.hideCursor) effects.push("hideCursor");
	if (clip.disableSmoothCursor) effects.push("disableSmoothCursor");
	if (zoomTouchesEdge(zooms, clip, side)) effects.push("zoom");
	return effects;
}

export type RestoreDecision =
	| { kind: "plain" }
	| { kind: "single"; side: Side }
	| { kind: "conflict" };

export function decideRestore(
	gap: TrimGap,
	clips: ClipRegion[],
	zooms: ZoomRegion[],
): RestoreDecision {
	const before = clips.find((c) => c.id === gap.beforeClipId);
	const after = clips.find((c) => c.id === gap.afterClipId);
	const beforeFx = neighbourEffects(before, zooms, "before");
	const afterFx = neighbourEffects(after, zooms, "after");
	if (beforeFx.length === 0 && afterFx.length === 0) return { kind: "plain" };
	if (afterFx.length === 0) return { kind: "single", side: "before" };
	if (beforeFx.length === 0) return { kind: "single", side: "after" };
	const same =
		before && after && clipEffectKey(before) === clipEffectKey(after) &&
		beforeFx.join() === afterFx.join();
	return same ? { kind: "plain" } : { kind: "conflict" };
}

/**
 * Bring the gap back as a new clip. `side` picks whose effects it inherits (clip speed,
 * volume, mute, hidden cursor, and zoom regions reaching that edge are stretched over it).
 */
export function restoreTrimGap(params: {
	gap: TrimGap;
	clips: ClipRegion[];
	zooms: ZoomRegion[];
	side: Side | null;
	createId: () => string;
}): { clips: ClipRegion[]; zooms: ZoomRegion[] } {
	const { gap, clips, zooms, side, createId } = params;
	const inherit = side === "before" ? clips.find((c) => c.id === gap.beforeClipId) : side === "after" ? clips.find((c) => c.id === gap.afterClipId) : undefined;
	const speed = inherit?.speed ?? 1;
	const restored: ClipRegion = {
		id: createId(),
		startMs: 0,
		endMs: Math.max(1, Math.round((gap.endMs - gap.startMs) / speed)),
		sourceStartMs: gap.startMs,
		speed,
		muted: inherit?.muted ?? false,
		showSourceAudio: inherit?.showSourceAudio ?? false,
		...(inherit?.hideCursor ? { hideCursor: true } : {}),
		...(inherit?.disableSmoothCursor ? { disableSmoothCursor: true } : {}),
		...(inherit && getClipVolume(inherit) !== 1 ? { volume: getClipVolume(inherit) } : {}),
	};
	if (inherit?.sourceMinMs !== undefined) restored.sourceMinMs = inherit.sourceMinMs;
	if (inherit?.sourceMaxMs !== undefined) restored.sourceMaxMs = inherit.sourceMaxMs;

	const sorted = sortClipRegions(clips);
	const after = clips.find((c) => c.id === gap.afterClipId);
	const insertAt = after ? sorted.findIndex((c) => c.id === after.id) : sorted.length;
	const nextClips = packClipSequence([
		...sorted.slice(0, insertAt),
		restored,
		...sorted.slice(insertAt),
	]);
	let nextZooms = rippleBySource(zooms, clips, nextClips);
	if (side && inherit) {
		const placed = nextClips.find((c) => c.id === restored.id)!;
		const edge = nextClips.find((c) => c.id === inherit.id)!;
		nextZooms = nextZooms.map((z) => {
			if (side === "before" && z.endMs >= edge.endMs - ZOOM_EDGE_MS && z.endMs <= edge.endMs && z.startMs < edge.endMs) {
				return { ...z, endMs: placed.endMs };
			}
			if (side === "after" && z.startMs <= edge.startMs + ZOOM_EDGE_MS && z.startMs >= edge.startMs && z.endMs > edge.startMs) {
				return { ...z, startMs: placed.startMs };
			}
			return z;
		});
	}
	return { clips: nextClips, zooms: nextZooms };
}
