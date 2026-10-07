import { describe, expect, it } from "vitest";
import { getCaptionBottomOffsetPercent, getCaptionWordVisualState } from "./captionStyle";

describe("getCaptionBottomOffsetPercent", () => {
	it("lifts captions above the reel UI only in tall outputs", () => {
		expect(getCaptionBottomOffsetPercent(3, 1920, 1080)).toBe(3);
		expect(getCaptionBottomOffsetPercent(3, 1080, 1350)).toBe(3);
		expect(getCaptionBottomOffsetPercent(3, 1080, 1920)).toBe(20);
		expect(getCaptionBottomOffsetPercent(30, 1080, 1920)).toBe(30);
	});
});

describe("getCaptionWordVisualState", () => {
	it("dims upcoming words only in word mode with real timings", () => {
		expect(getCaptionWordVisualState(true, "upcoming", "word").isInactive).toBe(true);
		expect(getCaptionWordVisualState(true, "active", "word").isInactive).toBe(false);
		expect(getCaptionWordVisualState(true, "upcoming", "line").isInactive).toBe(false);
		expect(getCaptionWordVisualState(false, "upcoming", "word").isInactive).toBe(false);
	});
});
