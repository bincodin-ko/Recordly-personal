import { describe, expect, it } from "vitest";
import {
	CAMERA_LAYOUT_TRANSITION_MS,
	computeWebcamCameraFrame,
	getCameraLayoutMix,
	getCursorAvoidAmount,
	getCursorAvoidSwitchTimes,
	getMirroredPreset,
	getSilentRanges,
	getSpeechVisibility,
	getSplitLayout,
	resolveCameraFrame,
} from "./cameraLayout";
import { DEFAULT_WEBCAM_OVERLAY } from "./types";

const regions = [
	{ id: "a", startMs: 1000, endMs: 3000, layout: "split" as const },
	{ id: "b", startMs: 3000, endMs: 5000, layout: "fullscreen" as const },
];

describe("getCameraLayoutMix", () => {
	it("is the default layout before any range", () => {
		expect(getCameraLayoutMix(regions, 500)).toEqual({ from: "default", to: "default", progress: 1 });
	});
	it("animates into a range from its start", () => {
		const mix = getCameraLayoutMix(regions, 1000 + CAMERA_LAYOUT_TRANSITION_MS / 2);
		expect(mix.from).toBe("default");
		expect(mix.to).toBe("split");
		expect(mix.progress).toBeCloseTo(0.5, 5);
		expect(getCameraLayoutMix(regions, 2500).progress).toBe(1);
	});
	it("goes straight between adjacent ranges", () => {
		const mix = getCameraLayoutMix(regions, 3100);
		expect(mix.from).toBe("split");
		expect(mix.to).toBe("fullscreen");
	});
	it("returns to default after the last range", () => {
		const mix = getCameraLayoutMix(regions, 5000 + CAMERA_LAYOUT_TRANSITION_MS);
		expect(mix).toEqual({ from: "fullscreen", to: "default", progress: 1 });
	});
});

describe("getSplitLayout", () => {
	const canvas = { width: 1920, height: 1080 };
	const mask = { x: 96, y: 54, width: 1728, height: 972 };
	it("puts screen left and camera right without overlap on landscape", () => {
		const split = getSplitLayout(canvas, mask, 48);
		const screenRight = split.screen.x + (mask.x + mask.width) * split.screen.scale;
		expect(split.screen.x + mask.x * split.screen.scale).toBeCloseTo(48, 3);
		expect(split.camera.x).toBeGreaterThan(screenRight);
		expect(split.camera.x + split.camera.width).toBeCloseTo(1920 - 48, 3);
		expect(split.camera.height).toBeCloseTo(mask.height * split.screen.scale, 3);
		expect(split.screenClip.width).toBeLessThan(split.camera.x);
	});
	it("stacks screen above camera on vertical canvases", () => {
		const vertical = { width: 1080, height: 1920 };
		const vmask = { x: 54, y: 656, width: 972, height: 547 };
		const split = getSplitLayout(vertical, vmask, 48);
		const screenBottom = split.screen.y + (vmask.y + vmask.height) * split.screen.scale;
		expect(split.camera.y).toBeGreaterThan(screenBottom);
		expect(split.camera.y + split.camera.height).toBeCloseTo(1920 - 48, 3);
		expect(split.camera.width).toBeCloseTo(vmask.width * split.screen.scale, 3);
	});
});

describe("resolveCameraFrame", () => {
	const base = {
		canvas: { width: 1920, height: 1080 },
		mask: { x: 0, y: 0, width: 1920, height: 1080 },
		bubble: { x: 1400, y: 600, width: 400, height: 400 },
		bubbleRadius: 200,
		bubbleOpacity: 1,
		margin: 48,
	};
	it("fullscreen fills the canvas", () => {
		const frame = resolveCameraFrame({ ...base, mix: { from: "default", to: "fullscreen", progress: 1 } });
		expect(frame.camera).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
		expect(frame.radius).toBe(0);
	});
	it("hidden fades the bubble out halfway through", () => {
		const frame = resolveCameraFrame({ ...base, mix: { from: "default", to: "hidden", progress: 0.5 } });
		expect(frame.opacity).toBeCloseTo(0.5);
		expect(frame.camera).toEqual(base.bubble);
	});
});

describe("hide during silence", () => {
	const cues = [
		{ id: "1", startMs: 500, endMs: 2000, text: "hello there" },
		{ id: "2", startMs: 6000, endMs: 7000, text: "back again" },
	];
	it("finds gaps longer than a second, leading and trailing", () => {
		const ranges = getSilentRanges(cues);
		expect(ranges.map((r) => [r.startMs, r.endMs])).toEqual([
			[2000, 6000],
			[7000, Number.POSITIVE_INFINITY],
		]);
	});
	it("is visible while talking and hidden mid-silence", () => {
		const ranges = getSilentRanges(cues);
		expect(getSpeechVisibility(ranges, 1500)).toBe(1);
		expect(getSpeechVisibility(ranges, 4000)).toBe(0);
		const fading = getSpeechVisibility(ranges, 2350);
		expect(fading).toBeGreaterThan(0);
		expect(fading).toBeLessThan(1);
		expect(getSpeechVisibility(ranges, 5900)).toBe(1);
		expect(getSpeechVisibility(ranges, 9000)).toBe(0);
	});
	it("does nothing without captions", () => {
		expect(getSpeechVisibility(getSilentRanges([]), 4000)).toBe(1);
	});
});

describe("avoid cursor", () => {
	const home = { x: 0.75, y: 0.6, width: 0.2, height: 0.35 };
	const away = { x: 0.05, y: 0.6, width: 0.2, height: 0.35 };
	it("switches once when the cursor comes near and stays", () => {
		const points = [
			{ timeMs: 0, x: 0.5, y: 0.5 },
			{ timeMs: 1000, x: 0.8, y: 0.7 },
			{ timeMs: 1500, x: 0.85, y: 0.8 },
			{ timeMs: 2000, x: 0.5, y: 0.5 },
			{ timeMs: 3000, x: 0.1, y: 0.8 },
		];
		expect(getCursorAvoidSwitchTimes(points, home, away)).toEqual([1000, 3000]);
		expect(getCursorAvoidAmount([1000, 3000], 900)).toBe(0);
		expect(getCursorAvoidAmount([1000, 3000], 2000)).toBe(1);
		expect(getCursorAvoidAmount([1000, 3000], 4000)).toBe(0);
	});
	it("mirrors only side presets", () => {
		expect(getMirroredPreset("bottom-right")).toBe("bottom-left");
		expect(getMirroredPreset("top-left")).toBe("top-right");
		expect(getMirroredPreset("bottom-center")).toBeNull();
	});
	it("moves the bubble to the other corner in the full pipeline", () => {
		const canvas = { width: 1920, height: 1080 };
		const common = {
			webcam: { ...DEFAULT_WEBCAM_OVERLAY, enabled: true, sourcePath: "x" },
			canvas,
			mask: { x: 0, y: 0, width: 1920, height: 1080 },
			widthPercent: 40,
			heightPercent: 40,
			zoomScale: 1,
			timelineMs: 5000,
			sourceMs: 5000,
			cursorTelemetry: [
				{ timeMs: 0, cx: 0.5, cy: 0.5 },
				{ timeMs: 1000, cx: 0.9, cy: 0.9 },
			],
		};
		const before = computeWebcamCameraFrame({ ...common, cursorMs: 500, cache: {} });
		const after = computeWebcamCameraFrame({ ...common, cursorMs: 3000, cache: {} });
		expect(before.camera.x).toBeGreaterThan(960);
		expect(after.camera.x).toBeLessThan(960);
		const off = computeWebcamCameraFrame({
			...common,
			webcam: { ...common.webcam, avoidCursor: false },
			cursorMs: 3000,
			cache: {},
		});
		expect(off.camera.x).toBeGreaterThan(960);
	});
});
