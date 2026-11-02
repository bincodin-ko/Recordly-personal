import { describe, expect, it } from "vitest";
import { decideRestore, findTrimGaps, restoreTrimGap } from "./trimRestore";
import type { ClipRegion, ZoomRegion } from "./types";

const a: ClipRegion = { id: "a", startMs: 0, endMs: 4000, speed: 1 };
const b: ClipRegion = { id: "b", startMs: 4000, endMs: 8000, speed: 1, sourceStartMs: 6000 };

describe("findTrimGaps", () => {
	it("finds head, middle and tail trims", () => {
		const gaps = findTrimGaps([{ ...a, sourceStartMs: 1000 }, { ...b, sourceStartMs: 6000 }], 12000);
		expect(gaps.map((g) => [g.startMs, g.endMs])).toEqual([[0, 1000], [5000, 6000], [10000, 12000]]);
		expect(gaps[1]).toMatchObject({ beforeClipId: "a", afterClipId: "b" });
	});
	it("reports no gap for an untrimmed recording", () => {
		expect(findTrimGaps([{ id: "x", startMs: 0, endMs: 5000, speed: 1 }], 5000)).toEqual([]);
	});
});

describe("decideRestore", () => {
	const gap = findTrimGaps([a, b], 8000).find((g) => g.beforeClipId === "a")!;
	it("plain when no neighbour has effects", () => {
		expect(decideRestore(gap, [a, b], [])).toEqual({ kind: "plain" });
	});
	it("single side when only one neighbour has effects", () => {
		expect(decideRestore(gap, [{ ...a, speed: 2 }, b], [])).toEqual({ kind: "single", side: "before" });
		expect(decideRestore(gap, [a, { ...b, volume: 0.5 }], [])).toEqual({ kind: "single", side: "after" });
	});
	it("conflict when both differ, plain when identical", () => {
		expect(decideRestore(gap, [{ ...a, speed: 2 }, { ...b, muted: true }], [])).toEqual({ kind: "conflict" });
		expect(decideRestore(gap, [{ ...a, speed: 2 }, { ...b, speed: 2 }], [])).toEqual({ kind: "plain" });
	});
	it("treats a zoom reaching the edge as an effect", () => {
		const zoom = { id: "z", startMs: 3000, endMs: 4000 } as ZoomRegion;
		expect(decideRestore(gap, [a, b], [zoom])).toEqual({ kind: "single", side: "before" });
	});
});

describe("restoreTrimGap", () => {
	const gap = findTrimGaps([a, b], 8000).find((g) => g.beforeClipId === "a")!;
	it("inserts the footage with the chosen side's speed and stretches its zoom", () => {
		const fast = { ...a, speed: 2, endMs: 2000 } as ClipRegion;
		const nb = { ...b, startMs: 2000, endMs: 6000 };
		const zoom = { id: "z", startMs: 1500, endMs: 2000 } as ZoomRegion;
		const out = restoreTrimGap({ gap: { ...gap, startMs: 8000, endMs: 10000, beforeClipId: "a", afterClipId: "b" }, clips: [fast, nb], zooms: [zoom], side: "before", createId: () => "r" });
		const restored = out.clips.find((c) => c.id === "r")!;
		expect(restored.speed).toBe(2);
		expect(out.clips.map((c) => c.id)).toEqual(["a", "r", "b"]);
		expect(out.zooms[0].endMs).toBe(restored.endMs);
	});
});

describe("restoring every gap in a row (side panel 'undo all')", () => {
	it("leaves no gaps", () => {
		let clips: ClipRegion[] = [
			{ id: "a", startMs: 0, endMs: 1000, sourceStartMs: 500, speed: 1 } as ClipRegion,
			{ id: "b", startMs: 1000, endMs: 2000, sourceStartMs: 3000, speed: 1 } as ClipRegion,
		];
		let zooms: ZoomRegion[] = [];
		let n = 0;
		for (const gap of findTrimGaps(clips, 6000)) {
			const result = restoreTrimGap({ gap, clips, zooms, side: null, createId: () => `r${n++}` });
			clips = result.clips;
			zooms = result.zooms;
		}
		expect(findTrimGaps(clips, 6000)).toEqual([]);
	});
});
