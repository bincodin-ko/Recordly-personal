import type { CaptionWordState } from "./captionLayout";
import { type AutoCaptionDisplayMode, DEFAULT_AUTO_CAPTION_SETTINGS } from "./types";

export const CAPTION_FONT_WEIGHT = 400;
export const CAPTION_LINE_HEIGHT = 1.32;

const DEFAULT_CAPTION_REFERENCE_WIDTH = 1920 * (DEFAULT_AUTO_CAPTION_SETTINGS.maxWidth / 100);

export function getCaptionTargetWidth(containerWidth: number, maxWidthPercent: number) {
	return Math.max(1, containerWidth * (maxWidthPercent / 100));
}

export function getCaptionScaledFontSize(
	fontSize: number,
	containerWidth: number,
	maxWidthPercent: number,
) {
	return Math.max(
		14,
		fontSize *
			(getCaptionTargetWidth(containerWidth, maxWidthPercent) /
				DEFAULT_CAPTION_REFERENCE_WIDTH),
	);
}

/** Bottom share of a vertical frame covered by Reels/TikTok/Shorts UI. */
export const PORTRAIT_CAPTION_SAFE_BOTTOM_PERCENT = 20;

/** Re-fit captions above the reel UI when the output is vertical (9:16, 10:16). */
export function getCaptionBottomOffsetPercent(
	bottomOffset: number,
	width: number,
	height: number,
) {
	return height >= width * 1.5
		? Math.max(bottomOffset, PORTRAIT_CAPTION_SAFE_BOTTOM_PERCENT)
		: bottomOffset;
}

export function getCaptionPadding(fontSize: number) {
	return {
		x: fontSize * 1.1,
		y: fontSize * 0.78,
	};
}

export function getCaptionScaledRadius(radius: number, fontSize: number) {
	const baseline = Math.max(1, DEFAULT_AUTO_CAPTION_SETTINGS.fontSize);
	return Math.max(0, radius * (fontSize / baseline));
}

export function getCaptionTextMaxWidth(
	containerWidth: number,
	maxWidthPercent: number,
	fontSize: number,
) {
	const padding = getCaptionPadding(fontSize);
	return Math.max(
		fontSize * 4,
		getCaptionTargetWidth(containerWidth, maxWidthPercent) - padding.x * 2,
	);
}

export function getCaptionWordVisualState(
	hasWordTimings: boolean,
	state: CaptionWordState,
	displayMode: AutoCaptionDisplayMode = "line",
) {
	// "line": uniform block. "word": karaoke-style, words not yet spoken are dimmed.
	// Falls back to uniform when the cue has no real word timings.
	if (displayMode !== "word" || !hasWordTimings) {
		return { isInactive: false, opacity: 1 };
	}
	return { isInactive: state === "upcoming", opacity: 1 };
}
