// Quick export settings (format + quality) used by the widget's Save/Copy.
// Choices map to the editor's export presets: 720p/1080p = GIF size "medium"/"large".

// Shared with src/components/launch/QuickExportWidget.tsx.
export const QUICK_EXPORT_SETTINGS_KEY = "recordly.quickExport.settings";

export type QuickExportFormat = "mp4" | "gif";
export type QuickExportQuality = "720p" | "1080p" | "original";
export interface QuickExportSettings {
	format: QuickExportFormat;
	quality: QuickExportQuality;
}

const MAX_HEIGHT: Record<QuickExportQuality, number | null> = {
	"720p": 720,
	"1080p": 1080,
	original: null,
};

export function normalizeQuickExportSettings(value: unknown): QuickExportSettings {
	const raw = (value ?? {}) as Partial<QuickExportSettings>;
	return {
		format: raw.format === "gif" ? "gif" : "mp4",
		quality: raw.quality && raw.quality in MAX_HEIGHT ? raw.quality : "original",
	};
}

/** MP4 at the original size is the recording itself: no re-encode needed. */
export function needsQuickExportTranscode(settings: QuickExportSettings) {
	return settings.format !== "mp4" || settings.quality !== "original";
}

/** FFmpeg arguments that turn the raw recording into the chosen format/size. */
export function buildQuickExportFfmpegArgs(
	settings: QuickExportSettings,
	input: string,
	output: string,
): string[] {
	const height = MAX_HEIGHT[settings.quality];
	// Never upscale; -2 keeps the width even for H.264.
	const scale = height ? `scale=-2:'min(${height},ih)':flags=lanczos` : null;
	if (settings.format === "gif") {
		// 15 fps = the editor's default GIF frame rate.
		const filters = ["fps=15", scale].filter(Boolean).join(",");
		return [
			"-y",
			"-i",
			input,
			"-vf",
			`${filters},split[a][b];[a]palettegen[p];[b][p]paletteuse`,
			"-loop",
			"0",
			output,
		];
	}
	return [
		"-y",
		"-i",
		input,
		...(scale ? ["-vf", scale] : []),
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		"20",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-movflags",
		"+faststart",
		output,
	];
}
