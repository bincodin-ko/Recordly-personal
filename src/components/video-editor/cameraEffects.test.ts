import { describe, expect, it } from "vitest";
import { FACE_TRACKING_ZOOM, getCameraEffectsSourceRect, smoothFaceCenter } from "./cameraEffects";

const FULL = { x: 0, y: 0, width: 1, height: 1 };

describe("camera effects geometry", () => {
	it("cover-fits the crop to the bubble aspect without face tracking", () => {
		const rect = getCameraEffectsSourceRect(1920, 1080, FULL, 1, null);
		expect(rect).toMatchObject({ sx: 420, sy: 0, sw: 1080, sh: 1080, outWidth: 1080 });
	});

	it("zooms in, centres on the face and clamps to the frame", () => {
		const rect = getCameraEffectsSourceRect(1920, 1080, FULL, 1, { x: 0.25, y: 0.5 });
		const size = 1080 / FACE_TRACKING_ZOOM;
		expect(rect.sw).toBeCloseTo(size);
		expect(rect.sx + rect.sw / 2).toBeCloseTo(480);
		expect(rect.outWidth).toBe(1080);
		const edge = getCameraEffectsSourceRect(1920, 1080, FULL, 1, { x: 0, y: 0 });
		expect(edge.sx).toBe(0);
		expect(edge.sy).toBe(0);
	});

	it("smooths face motion and snaps after seeks", () => {
		const moved = smoothFaceCenter({ x: 0, y: 0 }, { x: 1, y: 1 }, 1 / 30);
		expect(moved.x).toBeGreaterThan(0);
		expect(moved.x).toBeLessThan(0.2);
		expect(smoothFaceCenter({ x: 0, y: 0 }, { x: 1, y: 1 }, -1)).toEqual({ x: 1, y: 1 });
		expect(smoothFaceCenter(null, { x: 0.4, y: 0.6 }, 0.1)).toEqual({ x: 0.4, y: 0.6 });
	});
});
