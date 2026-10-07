import { describe, expect, it } from "vitest";
import { applySpeedToSourceRanges, detectTypingBursts, rippleBySource } from "./typingSpeedUp";
import type { ClipRegion } from "./types";

const keys = (start: number, count: number, step = 200) => Array.from({ length: count }, (_, i) => start + i * step);

describe("detectTypingBursts", () => {
	it("finds sustained bursts and ignores short or sparse typing", () => {
		const times = [...keys(2000, 20), ...keys(20000, 3), ...keys(30000, 5, 1500), ...keys(40000, 30)];
		const result = detectTypingBursts(times, 60000);
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({ startMs: 1850, keyCount: 20 });
		expect(result[1].startMs).toBe(39850);
	});
	it("returns nothing without typing times", () => {
		expect(detectTypingBursts([], 10000)).toEqual([]);
	});
});

describe("applySpeedToSourceRanges", () => {
	const clips: ClipRegion[] = [{ id: "c1", startMs: 0, endMs: 10000, speed: 1 }];
	it("splits the clip and speeds the range, shortening the timeline", () => {
		let n = 0;
		const out = applySpeedToSourceRanges(clips, [{ startMs: 2000, endMs: 6000, speed: 2 }], () => `n${++n}`);
		expect(out.map((c) => [c.sourceStartMs, c.speed, c.startMs, c.endMs])).toEqual([
			[0, 1, 0, 2000],
			[2000, 2, 2000, 4000],
			[6000, 1, 4000, 8000],
		]);
	});
	it("keeps existing speed outside ranges and handles ranges spanning clips", () => {
		const two: ClipRegion[] = [
			{ id: "a", startMs: 0, endMs: 4000, speed: 1 },
			{ id: "b", startMs: 4000, endMs: 8000, speed: 1, sourceStartMs: 4000 },
		];
		const out = applySpeedToSourceRanges(two, [{ startMs: 3000, endMs: 5000, speed: 4 }], () => "x");
		expect(out.reduce((s, c) => s + (c.endMs - c.startMs), 0)).toBe(3000 + 500 + 3000);
	});
});

describe("rippleBySource", () => {
	it("moves effects with their footage across split pieces", () => {
		const before: ClipRegion[] = [{ id: "c1", startMs: 0, endMs: 10000, speed: 1 }];
		const after = applySpeedToSourceRanges(before, [{ startMs: 0, endMs: 4000, speed: 2 }], () => "p2");
		const [zoom] = rippleBySource([{ startMs: 5000, endMs: 8000 }], before, after);
		expect(zoom).toEqual({ startMs: 3000, endMs: 6000 });
	});
});
