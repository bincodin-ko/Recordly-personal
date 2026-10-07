import {
	type CaptionCue,
	type ClipRegion,
	getClipSourceEndMs,
	getClipSourceStartMs,
	sortClipRegions,
} from "./types";

/**
 * Edit-by-transcript range logic. Caption words live in source time; the video is a
 * ripple sequence of clips over source time. Cutting words = removing their source
 * ranges from every clip, then repacking the sequence.
 */

export interface SourceRange {
	startMs: number;
	endMs: number;
}

export interface TranscriptWord extends SourceRange {
	key: string;
	text: string;
	leadingSpace: boolean;
}

/** Pieces shorter than this (timeline ms) after a cut are dropped as slivers. */
const MIN_PIECE_MS = 50;

export const DEFAULT_PAUSE_THRESHOLD_MS = 1_000;
export const DEFAULT_PAUSE_KEEP_MS = 300;

export function listTranscriptWords(cues: CaptionCue[]): TranscriptWord[] {
	return [...cues]
		.sort((a, b) => a.startMs - b.startMs)
		.flatMap((cue) => {
			const words = cue.words?.length
				? cue.words
				: [{ text: cue.text, startMs: cue.startMs, endMs: cue.endMs, leadingSpace: true }];
			return words.map((word, index) => ({
				key: `${cue.id}:${index}`,
				text: word.text.trim(),
				startMs: word.startMs,
				endMs: word.endMs,
				leadingSpace: index === 0 || Boolean(word.leadingSpace),
			}));
		})
		.filter((word) => word.text.length > 0 && word.endMs >= word.startMs);
}

function clipSourceSpan(clip: ClipRegion): SourceRange {
	return { startMs: getClipSourceStartMs(clip), endMs: getClipSourceEndMs(clip) };
}

/** Words still playing somewhere in the sequence (midpoint inside a clip's source span). */
export function visibleTranscriptWords(
	words: TranscriptWord[],
	clips: ClipRegion[],
): TranscriptWord[] {
	if (clips.length === 0) return words;
	const spans = clips.map(clipSourceSpan);
	return words.filter((word) => {
		const mid = (word.startMs + word.endMs) / 2;
		return spans.some((span) => mid >= span.startMs && mid < span.endMs);
	});
}

export function mergeRanges(ranges: SourceRange[]): SourceRange[] {
	const sorted = ranges
		.filter((range) => range.endMs > range.startMs)
		.sort((a, b) => a.startMs - b.startMs);
	const merged: SourceRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.startMs <= last.endMs) last.endMs = Math.max(last.endMs, range.endMs);
		else merged.push({ ...range });
	}
	return merged;
}

const FILLER_WORDS = new Set([
	// English
	"um",
	"umm",
	"uh",
	"uhh",
	"uhm",
	"er",
	"erm",
	"ah",
	"hmm",
	"hm",
	"mm",
	"mhm",
	// Korean
	"음",
	"으음",
	"음음",
	"어",
	"어어",
	"아",
	"에",
	"그",
	"저",
	"흠",
]);

export function isFillerWord(text: string): boolean {
	return FILLER_WORDS.has(
		text
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]/gu, ""),
	);
}

/** Whisper word times are approximate; pad each cut, but never into the neighbouring words. */
const WORD_PAD_MS = 120;

/** Cut range for words[first..last] (words sorted by time), padded into the gaps around them. */
export function wordCutRange(words: TranscriptWord[], first: number, last: number): SourceRange {
	const prevEnd = first > 0 ? words[first - 1].endMs : Number.NEGATIVE_INFINITY;
	const nextStart = last < words.length - 1 ? words[last + 1].startMs : Number.POSITIVE_INFINITY;
	const { startMs } = words[first];
	const { endMs } = words[last];
	return {
		startMs: Math.max(0, Math.min(startMs, Math.max(prevEnd, startMs - WORD_PAD_MS))),
		endMs: Math.max(endMs, Math.min(nextStart, endMs + WORD_PAD_MS)),
	};
}

/** Filler words with their padded cut range as startMs/endMs. Expects time-sorted words. */
export function findFillerWords(words: TranscriptWord[]): TranscriptWord[] {
	return words.flatMap((word, index) =>
		isFillerWord(word.text) ? [{ ...word, ...wordCutRange(words, index, index) }] : [],
	);
}

/** How long a source range still plays on the timeline (cuts and speed applied). */
function playedMs(range: SourceRange, clips: ClipRegion[]): number {
	if (clips.length === 0) return range.endMs - range.startMs;
	return clips.reduce((total, clip) => {
		const span = clipSourceSpan(clip);
		const overlap = Math.min(range.endMs, span.endMs) - Math.max(range.startMs, span.startMs);
		const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
		return overlap > 0 ? total + overlap / speed : total;
	}, 0);
}

/**
 * Gaps between consecutive spoken words that still play longer than `thresholdMs` are
 * shortened to `keepMs` (half kept after the previous word, half before the next).
 */
export function findLongPauses(
	words: TranscriptWord[],
	thresholdMs = DEFAULT_PAUSE_THRESHOLD_MS,
	keepMs = DEFAULT_PAUSE_KEEP_MS,
	clips: ClipRegion[] = [],
): SourceRange[] {
	const sorted = [...words].sort((a, b) => a.startMs - b.startMs);
	const ranges: SourceRange[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const gapStart = sorted[i - 1].endMs;
		const gapEnd = sorted[i].startMs;
		const played = playedMs({ startMs: gapStart, endMs: gapEnd }, clips);
		if (played > thresholdMs && played > keepMs) {
			ranges.push({
				startMs: Math.round(gapStart + keepMs / 2),
				endMs: Math.round(gapEnd - keepMs / 2),
			});
		}
	}
	return ranges;
}

/**
 * Remove source ranges from the clip sequence. Returns the retained pieces still at their
 * original timeline positions (`before`, for rippling effects) — callers repack them with
 * `packClipSequence`. Returns null when nothing changes or nothing would remain.
 */
export function cutSourceRanges(
	clips: ClipRegion[],
	ranges: SourceRange[],
	createId: () => string,
): ClipRegion[] | null {
	const cuts = mergeRanges(ranges);
	if (cuts.length === 0) return null;
	let changed = false;
	const pieces = sortClipRegions(clips).flatMap((clip) => {
		const span = clipSourceSpan(clip);
		const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
		const hits = cuts.filter((cut) => cut.endMs > span.startMs && cut.startMs < span.endMs);
		if (hits.length === 0) return [clip];
		changed = true;
		const kept: SourceRange[] = [];
		let cursor = span.startMs;
		for (const cut of hits) {
			if (cut.startMs > cursor) kept.push({ startMs: cursor, endMs: cut.startMs });
			cursor = Math.max(cursor, cut.endMs);
		}
		if (cursor < span.endMs) kept.push({ startMs: cursor, endMs: span.endMs });
		return kept.flatMap((range) => {
			const startMs = Math.round(clip.startMs + (range.startMs - span.startMs) / speed);
			const endMs = Math.round(clip.startMs + (range.endMs - span.startMs) / speed);
			if (endMs - startMs < MIN_PIECE_MS) return [];
			return [{ ...clip, id: createId(), startMs, endMs, sourceStartMs: range.startMs }];
		});
	});
	if (!changed || pieces.length === 0) return null;
	return pieces;
}

/**
 * Drop cut words from the captions (Descript-style: deleted words leave the transcript),
 * so a caption line never shows a word whose audio was removed. Cues left empty are removed.
 */
export function removeCaptionWordsInRanges(cues: CaptionCue[], ranges: SourceRange[]): CaptionCue[] {
	const cuts = mergeRanges(ranges);
	const isCut = (word: { startMs: number; endMs: number }) => {
		const mid = (word.startMs + word.endMs) / 2;
		return cuts.some((cut) => mid >= cut.startMs && mid < cut.endMs);
	};
	return cues.flatMap((cue) => {
		if (!cue.words?.length) return isCut(cue) ? [] : [cue];
		const words = cue.words.filter((word) => !isCut(word));
		if (words.length === cue.words.length) return [cue];
		if (words.length === 0) return [];
		const text = words
			.map((word, index) => `${index > 0 && word.leadingSpace ? " " : ""}${word.text.trim()}`)
			.join("")
			.trim();
		return [{ ...cue, text, words: [{ ...words[0], leadingSpace: undefined }, ...words.slice(1)] }];
	});
}
