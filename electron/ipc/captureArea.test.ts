import { describe, expect, it } from "vitest";
import { captureAreaForVideo, setPendingCaptureArea } from "./state";

describe("captureAreaForVideo", () => {
	it("crops only recordings made after the area was chosen", () => {
		const area = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
		setPendingCaptureArea(area);
		expect(captureAreaForVideo(`C:/rec/recording-${Date.now() + 1000}.mp4`)).toEqual(area);
		expect(captureAreaForVideo("C:/rec/recording-1700000000000.mp4")).toBeNull();
		expect(captureAreaForVideo("C:/videos/holiday.mp4")).toBeNull();
		setPendingCaptureArea(null);
		expect(captureAreaForVideo(`C:/rec/recording-${Date.now() + 1000}.mp4`)).toBeNull();
	});
});
