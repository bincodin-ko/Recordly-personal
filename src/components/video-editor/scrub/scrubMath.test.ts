import { describe, expect, it } from "vitest";
import { grainForRate, MAX_SCRUB_RATE, scrubRate } from "./scrubMath";
import { JKL_IDLE, jklRate, jklReduce, jklUsesNativePlayback } from "./jkl";

describe("scrubRate", () => {
	it("maps drag speed to signed rate", () => {
		expect(scrubRate(0.1, 0.1)).toBeCloseTo(1);
		expect(scrubRate(-0.2, 0.1)).toBeCloseTo(-2);
	});
	it("clamps, and treats a rest or bad input as silence", () => {
		expect(scrubRate(100, 0.05)).toBe(MAX_SCRUB_RATE);
		expect(scrubRate(-100, 0.05)).toBe(-MAX_SCRUB_RATE);
		expect(scrubRate(1, 0.5)).toBe(0);
		expect(scrubRate(1, 0)).toBe(0);
		expect(scrubRate(Number.NaN, 0.1)).toBe(0);
	});
});

describe("grainForRate", () => {
	it("is silent when still, reverse when negative, faster covers more audio", () => {
		expect(grainForRate(0)).toBeNull();
		expect(grainForRate(-1)?.reverse).toBe(true);
		const slow = grainForRate(1);
		const fast = grainForRate(4);
		expect(fast?.sourceSpanSeconds).toBeGreaterThan(slow?.sourceSpanSeconds ?? 0);
		expect(grainForRate(0.1)?.playbackRate).toBe(0.25);
	});
});

describe("jklReduce", () => {
	it("L steps 1x, 2x, 4x and stays at 4x", () => {
		let s = jklReduce(JKL_IDLE, "l");
		expect(jklRate(s)).toBe(1);
		expect(jklUsesNativePlayback(s)).toBe(true);
		s = jklReduce(s, "l");
		expect(jklRate(s)).toBe(2);
		expect(jklUsesNativePlayback(s)).toBe(false);
		s = jklReduce(jklReduce(s, "l"), "l");
		expect(jklRate(s)).toBe(4);
	});
	it("J goes backward, opposite key restarts at 1x, K stops", () => {
		let s = jklReduce(JKL_IDLE, "j");
		expect(jklRate(s)).toBe(-1);
		s = jklReduce(s, "j");
		expect(jklRate(s)).toBe(-2);
		s = jklReduce(s, "l");
		expect(jklRate(s)).toBe(1);
		expect(jklReduce(s, "k")).toEqual(JKL_IDLE);
	});
});
