import { describe, expect, it } from "vitest";
import {
	CURSOR_STOP_AT_END_MS,
	cleanupCursorSamples,
	DEFAULT_CURSOR_EXTRAS,
	getRawCursorRanges,
	isInsideRanges,
	normalizeCursorExtras,
} from "./cursorExtras";
import type { ClipRegion, CursorTelemetryPoint } from "./types";
import { SmoothedCursorState, DEFAULT_CURSOR_CONFIG } from "./videoPlayback/cursorRenderer";

const pt = (timeMs: number, cx: number, cy = 0.5, extra = {}): CursorTelemetryPoint => ({
	timeMs,
	cx,
	cy,
	...extra,
});

describe("raw cursor path (disable smooth mouse movement)", () => {
	it("maps flagged clips to source ranges", () => {
		const clips = [
			{ id: "a", startMs: 0, endMs: 1000, speed: 1 },
			{ id: "b", startMs: 1000, endMs: 3000, speed: 1, disableSmoothCursor: true },
		] as ClipRegion[];
		const ranges = getRawCursorRanges(clips);
		expect(ranges).toEqual([{ startMs: 1000, endMs: 3000 }]);
		expect(isInsideRanges(ranges, 2000)).toBe(true);
		expect(isInsideRanges(ranges, 500)).toBe(false);
	});

	it("smoothed state lags the target, snapTo (used inside the range) does not", () => {
		const smooth = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);
		smooth.update(0.1, 0.5, 0);
		smooth.update(0.9, 0.5, 16);
		expect(smooth.x).toBeLessThan(0.5);
		const raw = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);
		raw.update(0.1, 0.5, 0);
		raw.snapTo(0.9, 0.5, 16);
		expect(raw.x).toBe(0.9);
	});
});

describe("cleanupCursorSamples", () => {
	it("returns the same array when everything is off", () => {
		const s = [pt(0, 0.1), pt(10, 0.2)];
		expect(cleanupCursorSamples(s, { removeShakes: false, stopAtEnd: false })).toBe(s);
	});

	it("removes jitter inside the dead zone but keeps real moves and clicks", () => {
		const s = [
			pt(0, 0.5),
			pt(10, 0.5015),
			pt(20, 0.4985),
			pt(30, 0.5012),
			pt(40, 0.7),
			pt(50, 0.7005, 0.5, { interactionType: "click" }),
		];
		const out = cleanupCursorSamples(s, { removeShakes: true, stopAtEnd: false });
		expect(out.slice(0, 4).map((p) => p.cx)).toEqual([0.5, 0.5, 0.5, 0.5]);
		expect(out[4].cx).toBe(0.7);
		expect(out[5].cx).toBe(0.7005);
		expect(s[1].cx).toBe(0.5015); // input untouched
	});

	it("freezes the cursor for the last second", () => {
		const s = [pt(0, 0.1), pt(2000, 0.3), pt(3500, 0.4), pt(4000, 0.9)];
		const out = cleanupCursorSamples(s, { removeShakes: false, stopAtEnd: true });
		const freezeAt = 4000 - CURSOR_STOP_AT_END_MS; // 3000 -> held at the 2000ms sample
		expect(out.filter((p) => p.timeMs > freezeAt).map((p) => p.cx)).toEqual([0.3, 0.3]);
		expect(out[0].cx).toBe(0.1);
	});

	it("caches per option set", () => {
		const s = [pt(0, 0.1), pt(5000, 0.9)];
		const o = { removeShakes: false, stopAtEnd: true };
		expect(cleanupCursorSamples(s, o)).toBe(cleanupCursorSamples(s, o));
	});
});

describe("cursor extras defaults", () => {
	it("new toggles default off and survive normalize", () => {
		expect(DEFAULT_CURSOR_EXTRAS.stopCursorAtEnd).toBe(false);
		expect(DEFAULT_CURSOR_EXTRAS.removeCursorShakes).toBe(false);
		expect(DEFAULT_CURSOR_EXTRAS.alwaysDefaultCursor).toBe(false);
		const n = normalizeCursorExtras({ stopCursorAtEnd: true, removeCursorShakes: true });
		expect(n.stopCursorAtEnd && n.removeCursorShakes && !n.alwaysDefaultCursor).toBe(true);
	});
});

import { DEFAULT_CURSOR_CLICK_EFFECT } from "./types";
import { normalizeProjectEditor } from "./projectPersistence";

describe("click effect default", () => {
	it("is ripple for a new project but a saved project without the field stays off", () => {
		expect(DEFAULT_CURSOR_CLICK_EFFECT).toBe("ripple");
		expect(normalizeProjectEditor({}).cursorClickEffect).toBe("ripple");
		expect(normalizeProjectEditor({ cursorSize: 3 } as never).cursorClickEffect).toBe("none");
		expect(normalizeProjectEditor({ cursorClickEffect: "echo" }).cursorClickEffect).toBe("echo");
	});
});
