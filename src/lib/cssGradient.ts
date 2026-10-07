// CSS linear/radial-gradient wallpapers rendered for export the way the browser
// draws them in the preview (angle, stop positions, radial center/extent), but in
// float precision with dithering: a straight 8-bit fill of a wide, subtle gradient
// shows visible steps that H.264 makes worse.

type Rgba = [number, number, number, number];
type Stop = { color: Rgba; pos: number | null };

export type ParsedCssGradient =
	| { type: "linear"; angleRad: number | null; corner: [number, number] | null; stops: Stop[] }
	| {
			type: "radial";
			circle: boolean;
			extent: "closest-side" | "closest-corner" | "farthest-side" | "farthest-corner";
			at: [PositionPart, PositionPart];
			stops: Stop[];
	  };

type PositionPart = { frac: number; px: number };

// TPDF dither, same noise on R, G and B so it lands in luma (survives 4:2:0).
// +-3 LSB: the RGB->YUV step and the realtime H.264 encoder flatten weaker
// noise (+-1 kept almost nothing in NVENC tests); +-3 kept the ramp smooth.
const DITHER_AMPLITUDE = 3;

function splitTopLevel(params: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of params) {
		if (char === "(") depth++;
		if (char === ")") depth = Math.max(0, depth - 1);
		if (char === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
		} else current += char;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

function parseColor(text: string): Rgba | null {
	const hex = text.match(/^#([0-9a-f]{3,8})$/i)?.[1];
	if (hex) {
		const full =
			hex.length <= 4
				? hex
						.split("")
						.map((c) => c + c)
						.join("")
				: hex;
		if (full.length !== 6 && full.length !== 8) return null;
		const n = (i: number) => Number.parseInt(full.slice(i, i + 2), 16);
		return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
	}
	const fn = text.match(/^rgba?\(([^)]+)\)$/i)?.[1];
	if (fn) {
		const v = fn.split(/[\s,/]+/).filter(Boolean);
		if (v.length < 3) return null;
		const channel = (s: string) =>
			s.endsWith("%") ? (Number.parseFloat(s) * 255) / 100 : Number.parseFloat(s);
		const alpha =
			v[3] === undefined
				? 1
				: v[3].endsWith("%")
					? Number.parseFloat(v[3]) / 100
					: Number.parseFloat(v[3]);
		const out: Rgba = [channel(v[0]), channel(v[1]), channel(v[2]), alpha];
		return out.every(Number.isFinite) ? out : null;
	}
	// Named / hsl colors: let the browser normalize them to #rrggbb or rgba().
	if (typeof document === "undefined") return null;
	const ctx = document.createElement("canvas").getContext("2d");
	if (!ctx) return null;
	ctx.fillStyle = "#010203";
	ctx.fillStyle = text;
	const normalized = String(ctx.fillStyle);
	return normalized === "#010203" && text.toLowerCase() !== "#010203"
		? null
		: parseColor(normalized);
}

function parseLength(text: string): PositionPart | null {
	if (text.endsWith("%")) return { frac: Number.parseFloat(text) / 100, px: 0 };
	if (text.endsWith("px")) return { frac: 0, px: Number.parseFloat(text) };
	if (text === "0") return { frac: 0, px: 0 };
	return null;
}

const KEYWORD_FRAC: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

function parseStop(part: string): Stop[] | null {
	const m = part.match(/^((?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]+|[a-z]+)\s*(.*)$/i);
	if (!m) return null;
	const color = parseColor(m[1]);
	if (!color) return null;
	const positions = m[2].split(/\s+/).filter(Boolean);
	if (positions.length === 0) return [{ color, pos: null }];
	// px stops are rare in wallpapers; treat them like % of nothing -> unsupported.
	const fracs = positions.map((p) => (p.endsWith("%") ? Number.parseFloat(p) / 100 : Number.NaN));
	if (fracs.some((f) => !Number.isFinite(f))) return null;
	return fracs.map((pos) => ({ color, pos }));
}

export function parseCssGradient(value: string): ParsedCssGradient | null {
	const match = value.trim().match(/^(linear|radial)-gradient\((.*)\)$/is);
	if (!match) return null;
	const parts = splitTopLevel(match[2]);
	const first = parts[0]?.toLowerCase() ?? "";
	const stopsFrom = (start: number) => {
		const stops = parts.slice(start).flatMap((p) => parseStop(p) ?? [null]);
		return stops.length > 0 && stops.every(Boolean) ? (stops as Stop[]) : null;
	};

	if (match[1].toLowerCase() === "linear") {
		let angleRad: number | null = Math.PI; // default "to bottom"
		let corner: [number, number] | null = null;
		let start = 0;
		const angle = first.match(/^(-?[\d.]+)(deg|rad|turn|grad)$/);
		if (angle) {
			const n = Number.parseFloat(angle[1]);
			const perTurn = { deg: 360, rad: Math.PI * 2, turn: 1, grad: 400 }[
				angle[2] as "deg" | "rad" | "turn" | "grad"
			];
			angleRad = (n / perTurn) * Math.PI * 2;
			start = 1;
		} else if (first.startsWith("to ")) {
			const words = first.slice(3).split(/\s+/);
			const sx = words.includes("right") ? 1 : words.includes("left") ? -1 : 0;
			const sy = words.includes("bottom") ? 1 : words.includes("top") ? -1 : 0;
			if (sx !== 0 && sy !== 0) {
				corner = [sx, sy];
				angleRad = null;
			} else angleRad = Math.atan2(sx, -sy);
			start = 1;
		}
		const stops = stopsFrom(start);
		return stops ? { type: "linear", angleRad, corner, stops } : null;
	}

	let circle = false;
	let extent: Extract<ParsedCssGradient, { type: "radial" }>["extent"] = "farthest-corner";
	let at: [PositionPart, PositionPart] = [
		{ frac: 0.5, px: 0 },
		{ frac: 0.5, px: 0 },
	];
	let start = 0;
	if (!parseStop(parts[0] ?? "")) {
		const [shapePart, atPart] = first.split(/\bat\b/).map((s) => s.trim());
		const words = shapePart.split(/\s+/).filter(Boolean);
		if (
			words.some(
				(w) =>
					![
						"circle",
						"ellipse",
						"closest-side",
						"closest-corner",
						"farthest-side",
						"farthest-corner",
					].includes(w),
			)
		)
			return null; // explicit sizes: unsupported
		circle = words.includes("circle");
		extent = (words.find((w) => w !== "circle" && w !== "ellipse") as typeof extent) ?? extent;
		if (atPart) {
			const tokens = atPart.split(/\s+/);
			const pos = tokens.map((t) =>
				t in KEYWORD_FRAC ? { frac: KEYWORD_FRAC[t], px: 0 } : parseLength(t),
			);
			if (pos.some((p) => !p) || pos.length > 2) return null;
			if (tokens.length === 1 && (tokens[0] === "top" || tokens[0] === "bottom"))
				at = [{ frac: 0.5, px: 0 }, pos[0] as PositionPart];
			else at = [pos[0] as PositionPart, (pos[1] as PositionPart) ?? { frac: 0.5, px: 0 }];
		}
		start = 1;
	}
	const stops = stopsFrom(start);
	return stops ? { type: "radial", circle, extent, at, stops } : null;
}

/** CSS stop fix-up: missing first/last = 0/1, monotonic, gaps spread evenly. */
function resolveStops(stops: Stop[]): Array<{ color: Rgba; pos: number }> {
	const pos = stops.map((s) => s.pos);
	if (pos[0] === null) pos[0] = 0;
	if (pos[pos.length - 1] === null) pos[pos.length - 1] = 1;
	for (let i = 1; i < pos.length; i++) {
		if (pos[i] !== null) pos[i] = Math.max(pos[i] as number, pos[i - 1] as number);
	}
	for (let i = 1; i < pos.length; i++) {
		if (pos[i] !== null) continue;
		let j = i;
		while (pos[j] === null) j++;
		const a = pos[i - 1] as number;
		const b = pos[j] as number;
		for (let k = i; k < j; k++) pos[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
	}
	return stops.map((s, i) => ({ color: s.color, pos: pos[i] as number }));
}

/** Gradient parameter t (0 at first stop line, 1 at the end) for each pixel center. */
function createGradientParam(g: ParsedCssGradient, w: number, h: number) {
	if (g.type === "linear") {
		let dx: number;
		let dy: number;
		if (g.corner) {
			// Spec: the 50% line passes through the two other corners.
			const n = Math.hypot(w, h);
			dx = (g.corner[0] * h) / n;
			dy = (g.corner[1] * w) / n;
		} else {
			dx = Math.sin(g.angleRad ?? Math.PI);
			dy = -Math.cos(g.angleRad ?? Math.PI);
		}
		const length = Math.abs(w * dx) + Math.abs(h * dy);
		return (x: number, y: number) => ((x - w / 2) * dx + (y - h / 2) * dy) / length + 0.5;
	}
	const cx = g.at[0].frac * w + g.at[0].px;
	const cy = g.at[1].frac * h + g.at[1].px;
	const sides = [cx, w - cx, cy, h - cy].map(Math.abs);
	const far = g.extent.startsWith("farthest");
	const fx = far ? Math.max(sides[0], sides[1]) : Math.min(sides[0], sides[1]);
	const fy = far ? Math.max(sides[2], sides[3]) : Math.min(sides[2], sides[3]);
	let rx: number;
	let ry: number;
	if (g.circle) {
		const r = g.extent.endsWith("corner")
			? Math.hypot(fx, fy)
			: far
				? Math.max(fx, fy)
				: Math.min(fx, fy);
		rx = r;
		ry = r;
	} else {
		const k = g.extent.endsWith("corner") ? Math.SQRT2 : 1;
		rx = fx * k;
		ry = fy * k;
	}
	rx = Math.max(rx, 1e-6);
	ry = Math.max(ry, 1e-6);
	return (x: number, y: number) => Math.hypot((x - cx) / rx, (y - cy) / ry);
}

/** Interleaved gradient noise (Jimenez 2014): cheap, blue-noise-like, deterministic. */
function ign(x: number, y: number): number {
	const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
	return v - Math.floor(v);
}

/**
 * Fill `ctx` with the gradient, dithered. Returns false when the value is not a
 * gradient this parser understands (caller falls back to its own fill).
 */
export function paintCssGradient(
	ctx: CanvasRenderingContext2D,
	value: string,
	width: number,
	height: number,
	dither = true,
): boolean {
	const parsed = parseCssGradient(value);
	if (!parsed) return false;
	const image = ctx.createImageData(width, height);
	renderCssGradientPixels(parsed, image.data, width, height, dither);
	ctx.putImageData(image, 0, 0);
	return true;
}

export function renderCssGradientPixels(
	parsed: ParsedCssGradient,
	out: Uint8ClampedArray,
	width: number,
	height: number,
	dither = true,
): void {
	const stops = resolveStops(parsed.stops);
	// Premultiplied stops: CSS interpolates in premultiplied sRGB.
	const pre = stops.map(({ color: [r, g, b, a] }) => [r * a, g * a, b * a, a]);
	const param = createGradientParam(parsed, width, height);
	const last = stops.length - 1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const t = param(x + 0.5, y + 0.5);
			let i = 0;
			while (i < last && t > stops[i + 1].pos) i++;
			let c: number[];
			if (t <= stops[0].pos) c = pre[0];
			else if (i >= last) c = pre[last];
			else {
				const span = stops[i + 1].pos - stops[i].pos;
				const f = span > 0 ? (t - stops[i].pos) / span : 1;
				const p = pre[i];
				const q = pre[i + 1];
				c = [
					p[0] + (q[0] - p[0]) * f,
					p[1] + (q[1] - p[1]) * f,
					p[2] + (q[2] - p[2]) * f,
					p[3] + (q[3] - p[3]) * f,
				];
			}
			const a = c[3];
			const noise = dither ? (ign(x, y) + ign(x + 113, y + 71) - 1) * DITHER_AMPLITUDE : 0;
			const o = (y * width + x) * 4;
			const inv = a > 0 ? 1 / a : 0;
			out[o] = Math.round(c[0] * inv + noise);
			out[o + 1] = Math.round(c[1] * inv + noise);
			out[o + 2] = Math.round(c[2] * inv + noise);
			out[o + 3] = Math.round(a * 255);
		}
	}
}
