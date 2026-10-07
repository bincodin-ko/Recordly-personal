import { describe, expect, it } from "vitest";
import { packClipSequence } from "./clipSequence";
import {
	cutSourceRanges,
	findFillerWords,
	findLongPauses,
	isFillerWord,
	listTranscriptWords,
	mergeRanges,
	removeCaptionWordsInRanges,
	visibleTranscriptWords,
} from "./transcriptEdit";
import type { CaptionCue, ClipRegion } from "./types";

const clip = (over: Partial<ClipRegion> = {}): ClipRegion => ({
	id: "c1",
	startMs: 0,
	endMs: 10_000,
	speed: 1,
	...over,
});

let n = 0;
const id = () => `n${n++}`;

describe("transcriptEdit", () => {
	it("cuts a middle range and repacks to a shorter sequence", () => {
		const before = cutSourceRanges([clip()], [{ startMs: 2_000, endMs: 3_000 }], id)!;
		expect(before.map((c) => [c.startMs, c.endMs, c.sourceStartMs])).toEqual([
			[0, 2_000, 0],
			[3_000, 10_000, 3_000],
		]);
		const after = packClipSequence(before);
		expect(after[1].startMs).toBe(2_000);
		expect(after[1].endMs).toBe(9_000);
	});

	it("respects clip speed and source offsets", () => {
		const before = cutSourceRanges(
			[clip({ startMs: 0, endMs: 5_000, speed: 2, sourceStartMs: 1_000 })],
			[{ startMs: 3_000, endMs: 5_000 }],
			id,
		)!;
		// source 1000..11000 at 2x; cut 3000..5000 => keep 1000..3000 (1s) and 5000..11000 (3s)
		expect(before.map((c) => [c.startMs, c.endMs, c.sourceStartMs])).toEqual([
			[0, 1_000, 1_000],
			[2_000, 5_000, 5_000],
		]);
	});

	it("returns null when nothing changes or everything is cut", () => {
		expect(cutSourceRanges([clip()], [{ startMs: 20_000, endMs: 21_000 }], id)).toBeNull();
		expect(cutSourceRanges([clip()], [{ startMs: 0, endMs: 10_000 }], id)).toBeNull();
	});

	it("merges overlapping ranges", () => {
		expect(
			mergeRanges([
				{ startMs: 5, endMs: 8 },
				{ startMs: 0, endMs: 3 },
				{ startMs: 2, endMs: 6 },
			]),
		).toEqual([{ startMs: 0, endMs: 8 }]);
	});

	it("finds Korean and English fillers", () => {
		expect(isFillerWord("Um,")).toBe(true);
		expect(isFillerWord("음...")).toBe(true);
		expect(isFillerWord("어")).toBe(true);
		expect(isFillerWord("umbrella")).toBe(false);
		expect(isFillerWord("안녕하세요")).toBe(false);
	});

	it("shortens long pauses to the kept gap", () => {
		const cues: CaptionCue[] = [
			{
				id: "a",
				startMs: 0,
				endMs: 5_000,
				text: "hi um there",
				words: [
					{ text: "hi", startMs: 0, endMs: 500 },
					{ text: "um", startMs: 600, endMs: 900, leadingSpace: true },
					{ text: "there", startMs: 3_000, endMs: 3_500, leadingSpace: true },
				],
			},
		];
		const words = listTranscriptWords(cues);
		expect(findFillerWords(words).map((w) => [w.text, w.startMs, w.endMs])).toEqual([
			["um", 500, 1_020],
		]);
		expect(findLongPauses(words, 1_000, 300)).toEqual([{ startMs: 1_050, endMs: 2_850 }]);
		const cut = cutSourceRanges([clip()], [{ startMs: 600, endMs: 900 }], id)!;
		// Once tightened, the same gap no longer counts as a long pause.
		const tightened = cutSourceRanges(cut, findLongPauses(words, 1_000, 300, cut), id)!;
		expect(findLongPauses(words, 1_000, 300, tightened)).toEqual([]);
		const [edited] = removeCaptionWordsInRanges(cues, [{ startMs: 550, endMs: 950 }]);
		expect(edited.text).toBe("hi there");
		expect(removeCaptionWordsInRanges(cues, [{ startMs: 0, endMs: 4_000 }])).toEqual([]);
		expect(visibleTranscriptWords(words, cut).map((w) => w.text)).toEqual(["hi", "there"]);
	});
});
