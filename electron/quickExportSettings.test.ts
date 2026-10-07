import { describe, expect, it } from "vitest";
import {
	buildQuickExportFfmpegArgs,
	needsQuickExportTranscode,
	normalizeQuickExportSettings,
} from "./quickExportSettings";

describe("quick export settings", () => {
	it("defaults to the original MP4 (no re-encode)", () => {
		const settings = normalizeQuickExportSettings(null);
		expect(settings).toEqual({ format: "mp4", quality: "original" });
		expect(needsQuickExportTranscode(settings)).toBe(false);
		expect(normalizeQuickExportSettings({ format: "webm", quality: "8k" })).toEqual(settings);
	});

	it("scales MP4 down without upscaling", () => {
		const args = buildQuickExportFfmpegArgs({ format: "mp4", quality: "720p" }, "in.mp4", "out.mp4");
		expect(args).toContain("scale=-2:'min(720,ih)':flags=lanczos");
		expect(args.at(-1)).toBe("out.mp4");
	});

	it("builds a palette GIF", () => {
		const args = buildQuickExportFfmpegArgs({ format: "gif", quality: "original" }, "in.mp4", "out.gif");
		expect(args[args.indexOf("-vf") + 1]).toBe(
			"fps=15,split[a][b];[a]palettegen[p];[b][p]paletteuse",
		);
	});
});
