import { describe, expect, it } from "vitest";
import {
	applyZoomTransform,
	computeDirectionalMotionBlur,
	computeZoomTransform,
	createMotionBlurState,
} from "./zoomTransform";

function createStubContainer() {
	return {
		scale: { set: () => undefined },
		position: { set: () => undefined },
	};
}

describe("computeDirectionalMotionBlur", () => {
	it("normalizes cursor and camera motion to the same 60fps baseline", () => {
		const at60Fps = computeDirectionalMotionBlur({ x: 12, y: 0 }, 0.5, 1 / 60);
		const at30Fps = computeDirectionalMotionBlur({ x: 12, y: 0 }, 0.5, 1 / 30);

		expect(at60Fps.velocity).toEqual({ x: 6, y: 0 });
		expect(at30Fps.velocity).toEqual({ x: 3, y: 0 });
		expect(at60Fps.kernelSize).toBe(13);
		expect(at60Fps.offset).toBeCloseTo(-6 / 32, 6);
	});
});

describe("applyZoomTransform motion blur routing", () => {
	it("keeps pure translation on the directional blur path", () => {
		const motionBlurState = createMotionBlurState();
		const motionBlurFilter = {
			velocity: { x: 0, y: 0 },
			kernelSize: 5,
			offset: 0,
		};
		const zoomBlurFilter = {
			strength: 0,
			center: { x: 0, y: 0 },
			innerRadius: 0,
			radius: -1,
		};

		const sharedParams = {
			cameraContainer: createStubContainer() as never,
			zoomBlurFilter: zoomBlurFilter as never,
			motionBlurFilter: motionBlurFilter as never,
			stageSize: { width: 1280, height: 720 },
			baseMask: { x: 80, y: 60, width: 1120, height: 600 },
			zoomScale: 1,
			focusX: 0.5,
			focusY: 0.5,
			isPlaying: true,
			motionBlurAmount: 1,
			motionBlurState,
		};

		applyZoomTransform({
			...sharedParams,
			transformOverride: { scale: 1, x: 0, y: 0 },
			frameTimeMs: 1000,
		});
		applyZoomTransform({
			...sharedParams,
			transformOverride: { scale: 1, x: 96, y: 24 },
			frameTimeMs: 1016,
		});

		expect(
			Math.hypot(motionBlurFilter.velocity.x, motionBlurFilter.velocity.y),
		).toBeGreaterThan(0);
		expect(zoomBlurFilter.strength).toBe(0);
	});

	it("infers an off-center zoom origin for radial blur", () => {
		const motionBlurState = createMotionBlurState();
		const motionBlurFilter = {
			velocity: { x: 0, y: 0 },
			kernelSize: 5,
			offset: 0,
		};
		const zoomBlurFilter = {
			strength: 0,
			center: { x: 0, y: 0 },
			innerRadius: 0,
			radius: -1,
		};
		const stageSize = { width: 1000, height: 800 };
		const baseMask = { x: 100, y: 100, width: 800, height: 600 };
		const focusX = 0.2;
		const focusY = 0.7;

		applyZoomTransform({
			cameraContainer: createStubContainer() as never,
			zoomBlurFilter: zoomBlurFilter as never,
			motionBlurFilter: motionBlurFilter as never,
			stageSize,
			baseMask,
			zoomScale: 1,
			focusX,
			focusY,
			isPlaying: true,
			motionBlurAmount: 1,
			motionBlurState,
			transformOverride: computeZoomTransform({
				stageSize,
				baseMask,
				zoomScale: 1,
				focusX,
				focusY,
			}),
			frameTimeMs: 1000,
		});
		applyZoomTransform({
			cameraContainer: createStubContainer() as never,
			zoomBlurFilter: zoomBlurFilter as never,
			motionBlurFilter: motionBlurFilter as never,
			stageSize,
			baseMask,
			zoomScale: 1.7,
			focusX,
			focusY,
			isPlaying: true,
			motionBlurAmount: 1,
			motionBlurState,
			transformOverride: computeZoomTransform({
				stageSize,
				baseMask,
				zoomScale: 1.7,
				focusX,
				focusY,
			}),
			frameTimeMs: 1016,
		});

		expect(zoomBlurFilter.strength).toBeGreaterThan(0);
		expect(Math.hypot(motionBlurFilter.velocity.x, motionBlurFilter.velocity.y)).toBe(0);
		expect(zoomBlurFilter.center.x).toBeCloseTo(stageSize.width / 2, 0);
		expect(zoomBlurFilter.center.y).toBeCloseTo(stageSize.height / 2, 0);
		expect(zoomBlurFilter.radius).toBe(-1);
	});

	it("keeps a zoom on the radial path even when its center moves farther than its size", () => {
		const motionBlurState = createMotionBlurState();
		const motionBlurFilter = {
			velocity: { x: 0, y: 0 },
			kernelSize: 5,
			offset: 0,
		};
		const zoomBlurFilter = {
			strength: 0,
			center: { x: 0, y: 0 },
			innerRadius: 0,
			radius: -1,
		};
		const sharedParams = {
			cameraContainer: createStubContainer() as never,
			zoomBlurFilter: zoomBlurFilter as never,
			motionBlurFilter: motionBlurFilter as never,
			stageSize: { width: 1280, height: 720 },
			baseMask: { x: 80, y: 60, width: 1120, height: 600 },
			zoomScale: 1,
			focusX: 0.5,
			focusY: 0.5,
			isPlaying: true,
			motionBlurAmount: 1,
			motionBlurState,
		};

		applyZoomTransform({
			...sharedParams,
			transformOverride: { scale: 1, x: 0, y: 0 },
			frameTimeMs: 1000,
		});
		applyZoomTransform({
			...sharedParams,
			transformOverride: { scale: 1.01, x: 120, y: 0 },
			frameTimeMs: 1016,
		});

		expect(zoomBlurFilter.strength).toBeGreaterThan(0);
		expect(Math.hypot(motionBlurFilter.velocity.x, motionBlurFilter.velocity.y)).toBe(0);
		expect(zoomBlurFilter.innerRadius).toBe(0);
	});
});

describe("zoom focus across aspect ratios", () => {
	it("keeps the zoom focus at the frame center after switching 16:9 -> 9:16", () => {
		const focus = { x: 0.9, y: 0.2 };
		for (const stageSize of [
			{ width: 1920, height: 1080 },
			{ width: 1080, height: 1920 },
		]) {
			// contained 16:9 video, as layoutVideoContent produces
			const maskWidth = Math.min(stageSize.width, (stageSize.height * 16) / 9);
			const baseMask = {
				x: (stageSize.width - maskWidth) / 2,
				y: (stageSize.height - (maskWidth * 9) / 16) / 2,
				width: maskWidth,
				height: (maskWidth * 9) / 16,
			};
			const zoomScale = 2;
			const t = computeZoomTransform({ stageSize, baseMask, zoomScale, focusX: focus.x, focusY: focus.y });
			const screenX = (baseMask.x + focus.x * baseMask.width) * t.scale + t.x;
			const screenY = (baseMask.y + focus.y * baseMask.height) * t.scale + t.y;
			expect(screenX).toBeCloseTo(stageSize.width / 2);
			expect(screenY).toBeCloseTo(stageSize.height / 2);
		}
	});
});
