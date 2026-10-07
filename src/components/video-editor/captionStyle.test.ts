import { describe, expect, it } from "vitest";
import { getCaptionBottomOffsetPercent } from "./captionStyle";

describe("getCaptionBottomOffsetPercent", () => {
	it("lifts captions above the reel UI only in tall outputs", () => {
		expect(getCaptionBottomOffsetPercent(3, 1920, 1080)).toBe(3);
		expect(getCaptionBottomOffsetPercent(3, 1080, 1350)).toBe(3);
		expect(getCaptionBottomOffsetPercent(3, 1080, 1920)).toBe(20);
		expect(getCaptionBottomOffsetPercent(30, 1080, 1920)).toBe(30);
	});
});
