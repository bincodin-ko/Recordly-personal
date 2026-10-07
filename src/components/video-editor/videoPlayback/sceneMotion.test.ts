import { describe, expect, it } from "vitest";
import type { ZoomRegion } from "../types";
import { createCursorFollowCameraState } from "./cursorFollowCamera";
import {
	getAutoFrameCursorReach,
	getAutoFrameFillScale,
	getAutoFrameSmoothingWindowMs,
	keepCursorInView,
	resolvePreviewMotionMode,
	resolveSceneZoomTarget,
	shouldComposePreviewFrame,
} from "./sceneMotion";

const region: ZoomRegion = {
	id: "zoom",
	startMs: 0,
	endMs: 4000,
	depth: 2,
	focus: { cx: 0.7, cy: 0.3 },
	mode: "manual",
};

describe("resolveSceneZoomTarget", () => {
	it("returns the neutral camera when no zoom is active", () => {
		expect(
			resolveSceneZoomTarget({
				zoomRegions: [],
				timeMs: 1000,
				cursorFollowCamera: createCursorFollowCameraState(),
			}),
		).toEqual({ scale: 1, focus: { cx: 0.5, cy: 0.5 }, progress: 0 });
	});

	it("resolves the same manual target for every rendering backend", () => {
		const target = resolveSceneZoomTarget({
			zoomRegions: [region],
			timeMs: 2000,
			cursorFollowCamera: createCursorFollowCameraState(),
		});

		expect(target.scale).toBeGreaterThan(1);
		// The scene evaluator clamps focus so the zoom never exposes the stage edge.
		expect(target.focus.cx).toBeCloseTo(2 / 3);
		expect(target.focus.cy).toBeCloseTo(1 / 3);
		expect(target.progress).toBe(1);
	});

	it("keeps the camera still and returns a lens for a Glass Loupe zoom", () => {
		const target = resolveSceneZoomTarget({
			zoomRegions: [{ ...region, loupe: true }],
			timeMs: 2000,
			cursorFollowCamera: createCursorFollowCameraState(),
		});

		expect(target.scale).toBe(1);
		expect(target.progress).toBe(0);
		expect(target.loupe).toMatchObject({ scale: 1.5, strength: 1, followCursor: false });
	});
});

describe("resolvePreviewMotionMode", () => {
	it.each([false, true])("preserves a plain pause with classic mode %s", (zoomClassicMode) => {
		expect(
			resolvePreviewMotionMode({
				isPlaying: false,
				isSeeking: false,
				shouldSnapPausedFrame: false,
				zoomClassicMode,
			}),
		).toBe("preserve");
	});

	it("snaps paused frames only for an intentional timeline seek", () => {
		expect(
			resolvePreviewMotionMode({
				isPlaying: false,
				isSeeking: false,
				shouldSnapPausedFrame: true,
				zoomClassicMode: false,
			}),
		).toBe("snap");
	});
});

describe("shouldComposePreviewFrame", () => {
	it("holds every visual sample, including blur and cursor state, while paused", () => {
		expect(
			shouldComposePreviewFrame({
				motionMode: "preserve",
				contentTimeChanged: true,
				shouldSnapPausedFrame: false,
			}),
		).toBe(false);
	});

	it("does not interpolate again at an unchanged playback timestamp", () => {
		expect(
			shouldComposePreviewFrame({
				motionMode: "spring",
				contentTimeChanged: false,
				shouldSnapPausedFrame: false,
			}),
		).toBe(false);
	});

	it("composes one exact frame when a seek requests it", () => {
		expect(
			shouldComposePreviewFrame({
				motionMode: "snap",
				contentTimeChanged: false,
				shouldSnapPausedFrame: true,
			}),
		).toBe(true);
	});
});


describe("preview seek completion", () => {
	it("holds the composed frame until seeking finishes, even with a pending refresh", () => {
		const pending = {
			motionMode: "snap" as const,
			contentTimeChanged: true,
			shouldSnapPausedFrame: true,
		};
		expect(shouldComposePreviewFrame({ ...pending, isSeeking: true })).toBe(false);
		expect(shouldComposePreviewFrame({ ...pending, isSeeking: false })).toBe(true);
	});
});

describe("instant zoom and auto framing", () => {
	const instantRegion: ZoomRegion = { ...region, startMs: 1000, endMs: 2000, instant: true };
	const resolve = (timeMs: number, extra = {}) =>
		resolveSceneZoomTarget({
			zoomRegions: [instantRegion],
			timeMs,
			cursorFollowCamera: createCursorFollowCameraState(),
			...extra,
		});

	it("cuts an instant zoom in and out at the block edges", () => {
		expect(resolve(999).progress).toBe(0);
		expect(resolve(1000)).toMatchObject({ progress: 1, instant: true });
		expect(resolve(1999).progress).toBe(1);
		expect(resolve(2000)).toMatchObject({ progress: 0, instant: true });
	});

	it("fills a vertical frame with 16:9 video and follows the cursor", () => {
		const autoFrameViewport = {
			stageSize: { width: 1080, height: 1920 },
			mask: { width: 1080, height: 607.5 },
		};
		const cursorTelemetry = [
			{ timeMs: 0, cx: 0.9, cy: 0.5 },
			{ timeMs: 10000, cx: 0.9, cy: 0.5 },
		];
		const target = resolveSceneZoomTarget({
			zoomRegions: [],
			timeMs: 5000,
			cursorFollowCamera: createCursorFollowCameraState(),
			cursorTelemetry,
			autoFrameViewport,
		});
		expect(target.scale).toBeCloseTo(1920 / 607.5);
		expect(target.progress).toBe(1);
		// Right edge clamp keeps the video covering the stage: 1 - 1080 / (2 * scale * 1080).
		expect(target.focus.cx).toBeCloseTo(1 - 1 / (2 * target.scale));
		expect(target.focus.cy).toBeCloseTo(0.5);
	});

	it("leaves matching aspect ratios untouched", () => {
		const target = resolveSceneZoomTarget({
			zoomRegions: [],
			timeMs: 0,
			cursorFollowCamera: createCursorFollowCameraState(),
			autoFrameViewport: {
				stageSize: { width: 1920, height: 1080 },
				mask: { width: 1700, height: 956 },
			},
		});
		expect(target.scale).toBe(1);
	});
});

describe("keepCursorInView", () => {
	it("pulls a lagging frame toward a cursor that left the inner area", () => {
		const viewport = { stageSize: { width: 1080, height: 1920 }, mask: { width: 1920, height: 1080 } };
		// visible half-width in normalized units = 1080 / (2 * scale * 1920)
		const scale = getAutoFrameFillScale(viewport);
		const reach = (1080 / (2 * scale * 1920)) * 0.7;
		const out = keepCursorInView({ cx: 0.2, cy: 0.5 }, { cx: 0.9, cy: 0.5 }, scale, viewport);
		expect(out.cx).toBeCloseTo(0.9 - reach);
		const near = keepCursorInView({ cx: 0.5, cy: 0.5 }, { cx: 0.52, cy: 0.5 }, scale, viewport);
		expect(near.cx).toBe(0.5);
	});
});

describe("auto frame follow speed", () => {
	it("maps slow..fast to a longer..shorter window and a looser..tighter reach", () => {
		expect(getAutoFrameSmoothingWindowMs(0.5)).toBe(800);
		expect(getAutoFrameSmoothingWindowMs(0)).toBe(1600);
		expect(getAutoFrameSmoothingWindowMs(1)).toBe(400);
		expect(getAutoFrameCursorReach(0.5)).toBeCloseTo(0.7);
		expect(getAutoFrameCursorReach(1)).toBeLessThan(getAutoFrameCursorReach(0));
	});

	it("keeps a fast cursor closer to center at fast speed", () => {
		const viewport = { stageSize: { width: 1080, height: 1920 }, mask: { width: 1920, height: 1080 } };
		const scale = getAutoFrameFillScale(viewport);
		const slow = keepCursorInView({ cx: 0.2, cy: 0.5 }, { cx: 0.9, cy: 0.5 }, scale, { ...viewport, followSpeed: 0 });
		const fast = keepCursorInView({ cx: 0.2, cy: 0.5 }, { cx: 0.9, cy: 0.5 }, scale, { ...viewport, followSpeed: 1 });
		expect(fast.cx).toBeGreaterThan(slow.cx);
	});
});
