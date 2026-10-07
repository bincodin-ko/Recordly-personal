// Screen Studio "Speed up typing": detect typing bursts from bare keypress timestamps
// (no key identity is ever stored) and turn chosen source-time ranges into faster clips.
import { packClipSequence } from "./clipSequence";
import { type ClipRegion, getClipSourceEndMs, getClipSourceStartMs, sortClipRegions } from "./types";

export interface TypingSuggestion {
	id: string;
	/** Source-time range of the burst. */
	startMs: number;
	endMs: number;
	keyCount: number;
}

export const DEFAULT_TYPING_SPEED = 2;
const MAX_GAP_MS = 1200;
const MIN_KEYS = 8;
const MIN_DURATION_MS = 2500;
const PAD_BEFORE_MS = 150;
const PAD_AFTER_MS = 350;

/** Group keypress times into bursts; a pause longer than 1.2 s ends one. */
export function detectTypingBursts(typingTimesMs: number[], sourceDurationMs: number): TypingSuggestion[] {
	const times = [...typingTimesMs].filter(Number.isFinite).sort((a, b) => a - b);
	const groups: number[][] = [];
	for (const time of times) {
		const last = groups[groups.length - 1];
		if (last && time - last[last.length - 1] <= MAX_GAP_MS) last.push(time);
		else groups.push([time]);
	}
	const suggestions: TypingSuggestion[] = [];
	for (const group of groups) {
		if (group.length < MIN_KEYS || group[group.length - 1] - group[0] < MIN_DURATION_MS) continue;
		const startMs = Math.max(0, group[0] - PAD_BEFORE_MS);
		const endMs = Math.min(sourceDurationMs, group[group.length - 1] + PAD_AFTER_MS);
		suggestions.push({ id: `typing-${suggestions.length + 1}`, startMs, endMs, keyCount: group.length });
	}
	return suggestions;
}

export interface SourceSpeedRange {
	startMs: number;
	endMs: number;
	speed: number;
}

/** Split clips at the range edges and set the speed of the pieces inside each range. */
export function applySpeedToSourceRanges(
	clips: ClipRegion[],
	ranges: SourceSpeedRange[],
	createId: () => string,
): ClipRegion[] {
	const out: ClipRegion[] = [];
	for (const clip of sortClipRegions(clips)) {
		const clipStart = getClipSourceStartMs(clip);
		const clipEnd = getClipSourceEndMs(clip);
		const cuts = new Set<number>([clipStart, clipEnd]);
		for (const range of ranges) {
			for (const edge of [range.startMs, range.endMs]) {
				if (edge > clipStart && edge < clipEnd) cuts.add(Math.round(edge));
			}
		}
		const points = [...cuts].sort((a, b) => a - b);
		let usedOriginalId = false;
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			const range = ranges.find((r) => r.startMs <= a && r.endMs >= b);
			const speed = range ? range.speed : clip.speed;
			const id = usedOriginalId ? createId() : clip.id;
			usedOriginalId = true;
			const duration = Math.max(1, Math.round((b - a) / speed));
			out.push({ ...clip, id, sourceStartMs: a, speed, startMs: 0, endMs: duration });
		}
	}
	return packClipSequence(out);
}

/**
 * Map timeline times through an edit using source time, so effects follow their footage
 * even when a clip was split into pieces (pieces get new ids, so id-based mapping fails).
 */
export function rippleBySource<T extends { startMs: number; endMs: number }>(
	regions: T[],
	before: ClipRegion[],
	after: ClipRegion[],
): T[] {
	const sortedBefore = sortClipRegions(before);
	const mapTime = (time: number, isEnd: boolean): number => {
		const owner =
			sortedBefore.find((c) => (isEnd ? time > c.startMs && time <= c.endMs : time >= c.startMs && time < c.endMs)) ??
			null;
		if (!owner) {
			const beforeEnd = Math.max(0, ...before.map((c) => c.endMs));
			const afterEnd = Math.max(0, ...after.map((c) => c.endMs));
			return time >= beforeEnd ? afterEnd + time - beforeEnd : time;
		}
		const source = getClipSourceStartMs(owner) + (time - owner.startMs) * owner.speed;
		const piece = after.find((c) =>
			isEnd
				? source > getClipSourceStartMs(c) && source <= getClipSourceEndMs(c)
				: source >= getClipSourceStartMs(c) && source < getClipSourceEndMs(c),
		);
		if (!piece) return Math.min(time, Math.max(0, ...after.map((c) => c.endMs)));
		return Math.round(piece.startMs + (source - getClipSourceStartMs(piece)) / piece.speed);
	};
	return regions.flatMap((region) => {
		const startMs = mapTime(region.startMs, false);
		const endMs = mapTime(region.endMs, true);
		return endMs > startMs ? [{ ...region, startMs, endMs }] : [];
	});
}
