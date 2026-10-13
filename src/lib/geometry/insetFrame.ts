import type { Graphics } from "pixi.js";
import { drawSquircleOnGraphics } from "./squircle";

export const INSET_FRAME_COLOR = 0x0b0b0f;

/** Dark ring along the inside edge of the video mask (Screen Studio "Inset"). */
export function drawInsetFrame(
	graphics: Graphics,
	rect: { x: number; y: number; width: number; height: number; radius: number },
	insetPercent: number,
) {
	graphics.clear();
	const px = (Math.min(rect.width, rect.height) * Math.max(0, insetPercent)) / 100;
	if (px <= 0.5) return;
	drawSquircleOnGraphics(graphics, rect);
	graphics.fill({ color: INSET_FRAME_COLOR });
	drawSquircleOnGraphics(graphics, {
		x: rect.x + px,
		y: rect.y + px,
		width: Math.max(1, rect.width - px * 2),
		height: Math.max(1, rect.height - px * 2),
		radius: Math.max(0, rect.radius - px),
	});
	graphics.cut();
}
