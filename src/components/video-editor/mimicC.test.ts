import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCameraLayoutMix, getCutoutRect, resolveCameraFrame } from "./cameraLayout";
import {
	DEFAULT_EDITOR_PREFERENCES,
	type EditorPresetSnapshot,
	parseEditorPresetFile,
	PRESET_FILE_VERSION,
	serializeEditorPresetFile,
} from "./editorPreferences";
import { getReelOverlayZones, loadReelOverlayKind, saveReelOverlayKind } from "./reelOverlay";
import { DEFAULT_AUTO_CAPTION_SETTINGS, DEFAULT_CROP_REGION } from "./types";

const canvas = { width: 1920, height: 1080 };
const mask = { x: 100, y: 80, width: 1720, height: 920 };
const bubble = { x: 1500, y: 700, width: 360, height: 270 };

describe("C1 cutout layout geometry", () => {
	const frame = (to: "cutout" | "default", progress: number) =>
		resolveCameraFrame({ canvas, mask, bubble, bubbleRadius: 40, bubbleOpacity: 1, margin: 48, mix: { from: "default", to, progress } });

	it("stands on the bottom edge on the bubble's side, with no rounding and no screen change", () => {
		const f = frame("cutout", 1);
		expect(f.radius).toBe(0);
		expect(f.opacity).toBe(1);
		expect(f.camera.y + f.camera.height).toBeCloseTo(canvas.height, 5);
		expect(f.camera.x + f.camera.width).toBeLessThanOrEqual(canvas.width);
		expect(f.camera.x).toBeGreaterThan(canvas.width / 2);
		expect(f.camera.height).toBeGreaterThan(bubble.height);
		expect(f.screen).toEqual({ scale: 1, x: 0, y: 0 });
	});
	it("keeps the camera aspect and mirrors to the left side for a left bubble", () => {
		const left = getCutoutRect(canvas, { ...bubble, x: 40 }, 24);
		expect(left.x).toBe(24);
		expect(left.width / left.height).toBeCloseTo(bubble.width / bubble.height, 5);
	});
	it("animates like other layouts: halfway is between bubble and cutout", () => {
		const start = frame("cutout", 0);
		const mid = frame("cutout", 0.5);
		const end = frame("cutout", 1);
		expect(start.camera).toEqual(bubble);
		expect(mid.camera.height).toBeGreaterThan(bubble.height);
		expect(mid.camera.height).toBeLessThan(end.camera.height);
		expect(mid.radius).toBeCloseTo(20, 5);
	});
	it("is a normal region kind for the layout mix", () => {
		const mix = getCameraLayoutMix([{ id: "a", startMs: 0, endMs: 2000, layout: "cutout" }], 1500);
		expect(mix).toEqual({ from: "default", to: "cutout", progress: 1 });
	});
});

describe("C2 reel overlay", () => {
	it("has zones only for Instagram and TikTok, inside the frame", () => {
		expect(getReelOverlayZones("off")).toBeNull();
		for (const kind of ["instagram", "tiktok"] as const) {
			const zones = getReelOverlayZones(kind);
			for (const z of Object.values(zones ?? {})) {
				expect(z.left + z.width).toBeLessThanOrEqual(100);
				expect(z.top + z.height).toBeLessThanOrEqual(100);
			}
		}
		expect(getReelOverlayZones("tiktok")).not.toEqual(getReelOverlayZones("instagram"));
	});
	it("persists the choice and falls back to off", () => {
		const store = new Map<string, string>();
		(globalThis as { localStorage?: unknown }).localStorage = {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
		};
		expect(loadReelOverlayKind()).toBe("off");
		saveReelOverlayKind("tiktok");
		expect(loadReelOverlayKind()).toBe("tiktok");
		store.set("recordly.reelOverlay", "nonsense");
		expect(loadReelOverlayKind()).toBe("off");
	});
	it("is never referenced by the export path", () => {
		const walk = (dir: string): string[] =>
			readdirSync(dir).flatMap((name) => {
				const full = join(dir, name);
				return statSync(full).isDirectory() ? walk(full) : [full];
			});
		for (const file of walk(join(__dirname, "../../lib/exporter")).filter((f) => /\.tsx?$/.test(f))) {
			expect(readFileSync(file, "utf8"), file).not.toMatch(/reelOverlay|ReelModeOverlay|reel-mode-overlay/);
		}
	});
});

describe("C3 preset files", () => {
	const snapshot: EditorPresetSnapshot = {
		...DEFAULT_EDITOR_PREFERENCES,
		cropRegion: DEFAULT_CROP_REGION,
		autoCaptionSettings: DEFAULT_AUTO_CAPTION_SETTINGS,
		shadowIntensity: 0.37,
		webcam: {
			...DEFAULT_EDITOR_PREFERENCES.webcam,
			layoutRegions: [{ id: "x", startMs: 0, endMs: 1000, layout: "cutout" }],
		},
	};
	it("round-trips name and settings, with a version, without per-recording layout ranges", () => {
		const text = serializeEditorPresetFile({ name: "내 프리셋", snapshot });
		expect(JSON.parse(text)).toMatchObject({ format: "recordly-preset", version: PRESET_FILE_VERSION });
		const parsed = parseEditorPresetFile(text);
		expect(parsed?.name).toBe("내 프리셋");
		expect(parsed?.snapshot.shadowIntensity).toBe(0.37);
		expect(parsed?.snapshot.webcam.layoutRegions).toEqual([]);
	});
	it("rejects invalid files", () => {
		const good = JSON.parse(serializeEditorPresetFile({ name: "a", snapshot }));
		for (const bad of [
			"",
			"not json",
			"[]",
			"null",
			JSON.stringify({ ...good, format: "other" }),
			JSON.stringify({ ...good, version: 99 }),
			JSON.stringify({ ...good, version: undefined }),
			JSON.stringify({ ...good, name: "  " }),
			JSON.stringify({ ...good, snapshot: null }),
		]) {
			expect(parseEditorPresetFile(bad), bad).toBeNull();
		}
	});
});
