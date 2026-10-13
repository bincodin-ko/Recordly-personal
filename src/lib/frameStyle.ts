/**
 * Screen Studio "Shadow" detail (angle / distance / softness) and "Inset" frame.
 * The defaults reproduce the previous fixed look: shadow straight down, same size and blur, no inset.
 */
export interface FrameStyle {
	/** Degrees, 0 = right, 90 = down (default), 180 = left, 270 = up. */
	shadowAngle: number;
	/** Multiplier of the base shadow offset (1 = default). */
	shadowDistance: number;
	/** Multiplier of the base shadow blur (1 = default). */
	shadowSoftness: number;
	/** Width of the inner frame as a percent of the shorter video side (0 = off). */
	inset: number;
}

export const DEFAULT_FRAME_STYLE: FrameStyle = Object.freeze({
	shadowAngle: 90,
	shadowDistance: 1,
	shadowSoftness: 1,
	inset: 0,
});

export const FRAME_STYLE_LIMITS = Object.freeze({
	shadowDistance: { min: 0, max: 2 },
	shadowSoftness: { min: 0, max: 2 },
	inset: { min: 0, max: 10 },
});

const num = (value: unknown, fallback: number) =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function normalizeFrameStyle(raw: Partial<FrameStyle> | null | undefined): FrameStyle {
	const angle = num(raw?.shadowAngle, DEFAULT_FRAME_STYLE.shadowAngle);
	const { shadowDistance, shadowSoftness, inset } = FRAME_STYLE_LIMITS;
	return {
		shadowAngle: ((angle % 360) + 360) % 360,
		shadowDistance: clamp(num(raw?.shadowDistance, 1), shadowDistance.min, shadowDistance.max),
		shadowSoftness: clamp(num(raw?.shadowSoftness, 1), shadowSoftness.min, shadowSoftness.max),
		inset: clamp(num(raw?.inset, 0), inset.min, inset.max),
	};
}

export function isDefaultFrameStyle(style: FrameStyle | undefined): boolean {
	if (!style) return true;
	const s = normalizeFrameStyle(style);
	return (
		s.shadowAngle === DEFAULT_FRAME_STYLE.shadowAngle &&
		s.shadowDistance === 1 &&
		s.shadowSoftness === 1 &&
		s.inset === 0
	);
}

/** Rotate a base downward shadow offset by the angle and scale by the distance multiplier. */
export function resolveShadowOffset(
	baseOffset: number,
	style: Pick<FrameStyle, "shadowAngle" | "shadowDistance">,
): { x: number; y: number } {
	const rad = (style.shadowAngle * Math.PI) / 180;
	const d = baseOffset * style.shadowDistance;
	// Round to kill float noise (cos(90deg) != 0 exactly).
	const r = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
	return { x: r(Math.cos(rad) * d), y: r(Math.sin(rad) * d) };
}
