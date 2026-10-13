import { describe, expect, it } from "vitest";
import {
	DEFAULT_FRAME_STYLE,
	isDefaultFrameStyle,
	normalizeFrameStyle,
	resolveShadowOffset,
} from "@/lib/frameStyle";
import { getAspectRatioLabel, getAspectRatioValue } from "@/utils/aspectRatioUtils";
import { normalizeProjectEditor } from "./projectPersistence";
import { getSceneEffectMetrics } from "./videoPlayback/sceneEffects";
import { activeZoomRegions, type ZoomRegion } from "./types";

const zoom = (id: string, disabled?: boolean): ZoomRegion => ({
	id,
	startMs: 0,
	endMs: 1000,
	depth: 2,
	focus: { cx: 0.5, cy: 0.5 },
	disabled,
});

describe("B1 aspect auto", () => {
	it("new projects start on auto and follow the recording aspect", () => {
		const editor = normalizeProjectEditor({});
		expect(editor.aspectRatio).toBe("native");
		expect(getAspectRatioLabel("native")).toBe("Auto");
		expect(getAspectRatioValue(editor.aspectRatio, 2560 / 1600)).toBeCloseTo(1.6);
		expect(getAspectRatioValue("native", 9 / 16)).toBeCloseTo(9 / 16);
	});
	it("saved ratios are kept and 3:4 exists", () => {
		expect(normalizeProjectEditor({ aspectRatio: "16:9" }).aspectRatio).toBe("16:9");
		expect(normalizeProjectEditor({ aspectRatio: "3:4" }).aspectRatio).toBe("3:4");
		expect(getAspectRatioValue("3:4")).toBeCloseTo(0.75);
	});
});

describe("B2 zoom disable", () => {
	it("drops disabled blocks before preview/export and keeps references when none are off", () => {
		const all = [zoom("a"), zoom("b", true), zoom("c")];
		expect(activeZoomRegions(all).map((r) => r.id)).toEqual(["a", "c"]);
		const none = [zoom("a")];
		expect(activeZoomRegions(none)).toBe(none);
	});
	it("persists the disabled flag through project normalization", () => {
		const editor = normalizeProjectEditor({ zoomRegions: [zoom("a", true), zoom("b")] });
		expect(editor.zoomRegions.map((r) => r.disabled)).toEqual([true, undefined]);
	});
});

describe("B3 shadow detail + inset", () => {
	it("defaults keep the previous straight-down look", () => {
		expect(isDefaultFrameStyle(DEFAULT_FRAME_STYLE)).toBe(true);
		const base = getSceneEffectMetrics({ viewportWidth: 640, backgroundBlur: 0, shadowIntensity: 1 });
		const withStyle = getSceneEffectMetrics({
			viewportWidth: 640,
			backgroundBlur: 0,
			shadowIntensity: 1,
			frameStyle: DEFAULT_FRAME_STYLE,
		});
		expect(withStyle.shadowFilter).toBe(base.shadowFilter);
		expect(base.shadowFilter).toContain("drop-shadow(0px 12px 48px");
	});
	it("maps angle, distance and softness into the shadow offset and blur", () => {
		expect(resolveShadowOffset(10, { shadowAngle: 0, shadowDistance: 2 })).toEqual({ x: 20, y: 0 });
		expect(resolveShadowOffset(10, { shadowAngle: 270, shadowDistance: 1 })).toEqual({ x: 0, y: -10 });
		const m = getSceneEffectMetrics({
			viewportWidth: 640,
			backgroundBlur: 0,
			shadowIntensity: 1,
			frameStyle: { ...DEFAULT_FRAME_STYLE, shadowAngle: 0, shadowSoftness: 0.5 },
		});
		expect(m.shadowFilter).toContain("drop-shadow(12px 0px 24px");
	});
	it("normalizes and persists the frame style", () => {
		expect(normalizeFrameStyle({ shadowAngle: -90, inset: 99 })).toMatchObject({
			shadowAngle: 270,
			inset: 10,
		});
		expect(normalizeProjectEditor({}).frameStyle).toEqual(DEFAULT_FRAME_STYLE);
		const saved = normalizeProjectEditor({ frameStyle: { ...DEFAULT_FRAME_STYLE, inset: 4 } });
		expect(saved.frameStyle.inset).toBe(4);
	});
});
