import { describe, expect, it } from "vitest";
import {
	buildClickSoundRegions,
	DEFAULT_CURSOR_EXTRAS,
	getActiveShortcut,
	getCursorVisibility,
	getHiddenCursorRanges,
	normalizeCursorExtras,
} from "./cursorExtras";
import type { ClipRegion, CursorTelemetryPoint } from "./types";

const still = (timeMs: number, cx = 0.5): CursorTelemetryPoint => ({ timeMs, cx, cy: 0.5 });

describe("cursorExtras", () => {
	it("fades the cursor out after the idle delay and back in before it moves", () => {
		const samples = [
			still(0, 0.1),
			still(100, 0.2),
			still(1000, 0.2),
			still(5000, 0.2),
			still(6000, 0.4),
		];
		expect(getCursorVisibility(samples, 1500, 2000, []).alpha).toBe(1);
		expect(getCursorVisibility(samples, 3000, 2000, []).alpha).toBe(0);
		expect(getCursorVisibility(samples, 5990, 2000, []).alpha).toBeGreaterThan(0.5);
		expect(getCursorVisibility(samples, 6000, 2000, []).alpha).toBe(1);
		expect(getCursorVisibility(samples, 3000, 0, []).alpha).toBe(1);
	});

	it("hides the cursor inside clips marked hideCursor", () => {
		const clips: ClipRegion[] = [
			{ id: "a", startMs: 0, endMs: 1000, speed: 1 },
			{ id: "b", startMs: 1000, endMs: 2000, speed: 1, hideCursor: true },
		];
		const ranges = getHiddenCursorRanges(clips);
		expect(ranges).toEqual([{ startMs: 1000, endMs: 2000 }]);
		expect(getCursorVisibility([still(0)], 1500, 0, ranges).alpha).toBe(0);
		expect(getCursorVisibility([still(0)], 500, 0, ranges).alpha).toBe(1);
	});

	it("shows a shortcut for about a second, skipping single keys unless enabled", () => {
		const keys = [
			{ timeMs: 100, key: "Esc", ctrl: false, alt: false, shift: false, meta: false },
			{ timeMs: 1000, key: "C", ctrl: true, alt: false, shift: true, meta: false },
		];
		const settings = { ...DEFAULT_CURSOR_EXTRAS, showShortcuts: true };
		expect(getActiveShortcut(keys, 200, settings)).toBeNull();
		expect(getActiveShortcut(keys, 1500, settings)?.caps).toEqual(["Ctrl", "Shift", "C"]);
		expect(getActiveShortcut(keys, 2100, settings)).toBeNull();
		expect(
			getActiveShortcut(keys, 300, { ...settings, showSingleKeyShortcuts: true })?.caps,
		).toEqual(["Esc"]);
	});

	it("builds one click-sound region per kept click on the timeline", () => {
		const samples: CursorTelemetryPoint[] = [
			{ ...still(500), interactionType: "click" },
			{ ...still(1500), interactionType: "click" },
		];
		const clips: ClipRegion[] = [
			{ id: "a", startMs: 0, endMs: 1000, sourceStartMs: 1000, speed: 1 },
		];
		const settings = normalizeCursorExtras({ clickSound: true });
		const regions = buildClickSoundRegions(samples, clips, settings);
		expect(regions.map((r) => r.startMs)).toEqual([500]);
		expect(buildClickSoundRegions(samples, clips, DEFAULT_CURSOR_EXTRAS)).toEqual([]);
	});
});
