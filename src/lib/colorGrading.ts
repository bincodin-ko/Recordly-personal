import { CanvasSource, Filter, GlProgram, GpuProgram } from "pixi.js";
import { glVertex, wgslVertex } from "./videoSharpenFilter";

// Color looks for the screen recording and the camera, applied the same way in
// preview and export: every look (preset or imported .cube) is baked into a 3D
// LUT stored as an RGBA8 strip (size*size x size; red across a slice, blue picks
// the slice, green down) and sampled with one shared shader function.

export interface StoredLut {
	name: string;
	size: number;
	/** base64 of size^3 RGB bytes, red fastest (the .cube order). */
	data: string;
}

export interface ColorLookSettings {
	/** "none", a preset id from COLOR_LOOKS, or "custom" (uses `lut`). */
	look: string;
	/** 0..1 blend between the original and the graded colors. */
	intensity: number;
	lut?: StoredLut | null;
}

export interface ColorGradingSettings {
	screen: ColorLookSettings;
	camera: ColorLookSettings;
	/** Camera sharpen, 0..1 (0 = off). */
	cameraSharpness: number;
}

export const DEFAULT_COLOR_LOOK: ColorLookSettings = { look: "none", intensity: 1, lut: null };
export const DEFAULT_COLOR_GRADING: ColorGradingSettings = {
	screen: DEFAULT_COLOR_LOOK,
	camera: DEFAULT_COLOR_LOOK,
	cameraSharpness: 0,
};

/** Shader amount at sharpness 1 (the screen auto-sharpen uses 0.12). */
export const MAX_CAMERA_SHARPEN_AMOUNT = 0.6;
const PRESET_LUT_SIZE = 33;
const MAX_LUT_SIZE = 65;

type Rgb = [number, number, number];
const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const map = (c: Rgb, f: (v: number, i: number) => number): Rgb => [
	f(c[0], 0),
	f(c[1], 1),
	f(c[2], 2),
];
const saturate = (c: Rgb, s: number): Rgb => {
	const l = luma(c);
	return map(c, (v) => l + (v - l) * s);
};
const sCurve = (c: Rgb, amount: number): Rgb =>
	map(c, (v) => {
		const x = Math.min(1, Math.max(0, v));
		return mix(v, x * x * (3 - 2 * x), amount);
	});
const gain = (c: Rgb, r: number, g: number, b: number): Rgb => [c[0] * r, c[1] * g, c[2] * b];
const lift = (c: Rgb, amount: number): Rgb => map(c, (v) => amount + v * (1 - amount));
const gamma = (c: Rgb, g: number): Rgb => map(c, (v) => Math.max(0, v) ** g);
const gray = (c: Rgb): Rgb => {
	const l = luma(c);
	return [l, l, l];
};
/** Pushes shadows toward one tint and highlights toward another. */
const splitTone = (c: Rgb, shadow: Rgb, highlight: Rgb, amount: number): Rgb => {
	const l = Math.min(1, Math.max(0, luma(c)));
	return map(c, (v, i) => v + amount * ((1 - l) * shadow[i] + l * highlight[i]));
};

export const COLOR_LOOKS: { id: string; apply: (c: Rgb) => Rgb }[] = [
	{ id: "natural", apply: (c) => saturate(sCurve(c, 0.25), 1.08) },
	{ id: "warm", apply: (c) => saturate(gain(c, 1.07, 1.01, 0.9), 1.05) },
	{ id: "cool", apply: (c) => gain(c, 0.93, 1.0, 1.08) },
	{ id: "vivid", apply: (c) => saturate(sCurve(c, 0.3), 1.4) },
	{ id: "soft", apply: (c) => saturate(lift(sCurve(c, -0.2), 0.04), 0.9) },
	{
		id: "cinematic",
		apply: (c) => sCurve(splitTone(c, [-0.06, 0.03, 0.08], [0.08, 0.02, -0.08], 1), 0.35),
	},
	{
		id: "film",
		apply: (c) =>
			saturate(
				splitTone(lift(sCurve(c, 0.2), 0.07), [0, 0.02, 0.03], [0.04, 0.02, -0.03], 1),
				0.88,
			),
	},
	{
		id: "vintage",
		apply: (c) => {
			const sepia: Rgb = [
				0.393 * c[0] + 0.769 * c[1] + 0.189 * c[2],
				0.349 * c[0] + 0.686 * c[1] + 0.168 * c[2],
				0.272 * c[0] + 0.534 * c[1] + 0.131 * c[2],
			];
			return lift(
				map(c, (v, i) => mix(v, sepia[i], 0.4)),
				0.06,
			);
		},
	},
	{ id: "bright", apply: (c) => saturate(gamma(c, 0.82), 1.05) },
	{
		id: "moody",
		apply: (c) => saturate(splitTone(gamma(c, 1.18), [0, 0.01, 0.04], [0, 0, 0], 1), 0.8),
	},
	{ id: "bw", apply: (c) => sCurve(gray(c), 0.2) },
	{ id: "noir", apply: (c) => sCurve(sCurve(gray(c), 0.8), 0.5) },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function clampLook(raw: unknown): ColorLookSettings {
	const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ColorLookSettings>;
	const lut =
		v.lut &&
		typeof v.lut.data === "string" &&
		Number.isInteger(v.lut.size) &&
		v.lut.size >= 2 &&
		v.lut.size <= MAX_LUT_SIZE
			? { name: String(v.lut.name ?? "LUT"), size: v.lut.size, data: v.lut.data }
			: null;
	const known = v.look === "custom" ? lut !== null : COLOR_LOOKS.some((l) => l.id === v.look);
	return {
		look: known ? (v.look as string) : "none",
		intensity:
			typeof v.intensity === "number" && Number.isFinite(v.intensity)
				? clamp01(v.intensity)
				: 1,
		lut,
	};
}

export function normalizeColorGrading(raw: unknown): ColorGradingSettings {
	const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ColorGradingSettings>;
	return {
		screen: clampLook(v.screen),
		camera: clampLook(v.camera),
		cameraSharpness:
			typeof v.cameraSharpness === "number" && Number.isFinite(v.cameraSharpness)
				? clamp01(v.cameraSharpness)
				: 0,
	};
}

export function isLookActive(look: ColorLookSettings | undefined): boolean {
	return Boolean(
		look && look.look !== "none" && look.intensity > 0 && (look.look !== "custom" || look.lut),
	);
}

export function hasActiveColorGrading(settings: ColorGradingSettings | undefined): boolean {
	return Boolean(
		settings &&
			(isLookActive(settings.screen) ||
				isLookActive(settings.camera) ||
				settings.cameraSharpness > 0),
	);
}

/** Parses an Adobe/Resolve .cube 3D LUT. Throws with a short reason on bad input. */
export function parseCubeLut(text: string): { size: number; data: Float32Array } {
	let size = 0;
	let domainMin: Rgb = [0, 0, 0];
	let domainMax: Rgb = [1, 1, 1];
	const values: number[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*/, "").trim();
		if (!line) continue;
		const parts = line.split(/\s+/);
		const key = parts[0].toUpperCase();
		if (key === "TITLE") continue;
		if (key === "LUT_1D_SIZE") throw new Error("1D LUTs are not supported");
		if (key === "LUT_3D_SIZE") {
			size = Number(parts[1]);
			continue;
		}
		if (key === "DOMAIN_MIN" || key === "DOMAIN_MAX") {
			const d = parts.slice(1, 4).map(Number) as Rgb;
			if (d.length !== 3 || d.some((n) => !Number.isFinite(n))) throw new Error(`Bad ${key}`);
			if (key === "DOMAIN_MIN") domainMin = d;
			else domainMax = d;
			continue;
		}
		if (/^[A-Z_]+$/.test(key)) continue; // unknown keyword (e.g. LUT_3D_INPUT_RANGE)
		if (parts.length !== 3) throw new Error(`Bad data line: ${line}`);
		for (const p of parts) {
			const n = Number(p);
			if (!Number.isFinite(n)) throw new Error(`Bad number: ${p}`);
			values.push(n);
		}
	}
	if (!Number.isInteger(size) || size < 2 || size > MAX_LUT_SIZE) {
		throw new Error("Missing or unsupported LUT_3D_SIZE");
	}
	if (values.length !== size ** 3 * 3) {
		throw new Error(`Expected ${size ** 3} entries, found ${values.length / 3}`);
	}
	const data = new Float32Array(values.length);
	for (let i = 0; i < values.length; i++) {
		const c = i % 3;
		data[i] = clamp01((values[i] - domainMin[c]) / (domainMax[c] - domainMin[c] || 1));
	}
	return { size, data };
}

function toBase64(bytes: Uint8Array): string {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(s);
}

function fromBase64(data: string): Uint8Array {
	const s = atob(data);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

export function cubeToStoredLut(name: string, text: string): StoredLut {
	const { size, data } = parseCubeLut(text);
	const bytes = new Uint8Array(data.length);
	for (let i = 0; i < data.length; i++) bytes[i] = Math.round(data[i] * 255);
	return { name, size, data: toBase64(bytes) };
}

export interface LutTexture {
	size: number;
	/** RGBA8, width size*size, height size. */
	rgba: Uint8Array;
}

function rgbToStrip(size: number, rgb: Uint8Array): LutTexture {
	// .cube order: r fastest, then g, then b. Strip pixel (x = r + b*size, y = g).
	const rgba = new Uint8Array(size * size * size * 4);
	for (let b = 0; b < size; b++) {
		for (let g = 0; g < size; g++) {
			for (let r = 0; r < size; r++) {
				const src = (r + g * size + b * size * size) * 3;
				const dst = (g * size * size + b * size + r) * 4;
				rgba[dst] = rgb[src];
				rgba[dst + 1] = rgb[src + 1];
				rgba[dst + 2] = rgb[src + 2];
				rgba[dst + 3] = 255;
			}
		}
	}
	return { size, rgba };
}

const presetCache = new Map<string, LutTexture>();
const customCache = new WeakMap<StoredLut, LutTexture>();
const customByData = new Map<string, LutTexture>();

/** The LUT texture for a look, or null when the look is off. Cached per look. */
export function getLookLut(look: ColorLookSettings | undefined): LutTexture | null {
	if (!look || !isLookActive(look)) return null;
	if (look.look === "custom" && look.lut) {
		const stored = look.lut;
		let lut = customCache.get(stored) ?? customByData.get(stored.data);
		if (!lut) {
			lut = rgbToStrip(stored.size, fromBase64(stored.data));
			// ponytail: keeps only the latest few custom LUTs by data string; fine for a handful per session.
			if (customByData.size > 4) customByData.clear();
			customByData.set(stored.data, lut);
		}
		customCache.set(stored, lut);
		return lut;
	}
	const cached = presetCache.get(look.look);
	if (cached) return cached;
	const preset = COLOR_LOOKS.find((l) => l.id === look.look);
	if (!preset) return null;
	const n = PRESET_LUT_SIZE;
	const rgb = new Uint8Array(n * n * n * 3);
	for (let b = 0; b < n; b++) {
		for (let g = 0; g < n; g++) {
			for (let r = 0; r < n; r++) {
				const out = preset.apply([r / (n - 1), g / (n - 1), b / (n - 1)]);
				const i = (r + g * n + b * n * n) * 3;
				rgb[i] = Math.round(clamp01(out[0]) * 255);
				rgb[i + 1] = Math.round(clamp01(out[1]) * 255);
				rgb[i + 2] = Math.round(clamp01(out[2]) * 255);
			}
		}
	}
	const lut = rgbToStrip(n, rgb);
	presetCache.set(look.look, lut);
	return lut;
}

/** CPU twin of LUT_GLSL (trilinear), used for look thumbnails and tests. Inputs/outputs 0..255. */
export function applyLutToPixel(lut: LutTexture, r: number, g: number, b: number): Rgb {
	const n = lut.size;
	const w = n * n;
	const fetch = (x: number, y: number, z: number, c: number) =>
		lut.rgba[(y * w + z * n + x) * 4 + c];
	const pos = [r, g, b].map((v) => clamp01(v / 255) * (n - 1));
	const i0 = pos.map(Math.floor);
	const i1 = i0.map((v) => Math.min(v + 1, n - 1));
	const f = pos.map((v, k) => v - i0[k]);
	const out: Rgb = [0, 0, 0];
	for (let c = 0; c < 3; c++) {
		const lerpR = (y: number, z: number) =>
			mix(fetch(i0[0], y, z, c), fetch(i1[0], y, z, c), f[0]);
		const lerpRG = (z: number) => mix(lerpR(i0[1], z), lerpR(i1[1], z), f[1]);
		out[c] = mix(lerpRG(i0[2]), lerpRG(i1[2]), f[2]);
	}
	return out;
}

/** GLSL LUT lookup shared by the Pixi filter and the preview camera canvas. */
export const LUT_GLSL = `
vec3 applyLut(vec3 c) {
    float n = uLutSize;
    vec3 x = clamp(c, 0.0, 1.0) * (n - 1.0);
    float b0 = floor(x.b);
    float b1 = min(b0 + 1.0, n - 1.0);
    float u = (x.r + 0.5) / (n * n);
    float v = (x.g + 0.5) / n;
    vec3 s0 = texture(uLut, vec2(u + b0 / n, v)).rgb;
    vec3 s1 = texture(uLut, vec2(u + b1 / n, v)).rgb;
    return mix(s0, s1, x.b - b0);
}`;

const glFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uLut;
uniform float uLutSize;
uniform float uIntensity;
${LUT_GLSL}
void main(void)
{
    vec4 c = texture(uTexture, vTextureCoord);
    vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    rgb = mix(rgb, applyLut(rgb), uIntensity);
    finalColor = vec4(rgb * c.a, c.a);
}`;

const wgslFragment = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct LutUniforms {
  uLutSize: f32,
  uIntensity: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> lutUniforms : LutUniforms;
@group(1) @binding(1) var uLut: texture_2d<f32>;
@group(1) @binding(2) var uLutSampler: sampler;

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
  let c = textureSample(uTexture, uSampler, uv);
  let rgb = select(vec3<f32>(0.0), c.rgb / max(c.a, 0.00001), c.a > 0.0);
  let n = lutUniforms.uLutSize;
  let x = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * (n - 1.0);
  let b0 = floor(x.b);
  let b1 = min(b0 + 1.0, n - 1.0);
  let u = (x.r + 0.5) / (n * n);
  let v = (x.g + 0.5) / n;
  let s0 = textureSample(uLut, uLutSampler, vec2<f32>(u + b0 / n, v)).rgb;
  let s1 = textureSample(uLut, uLutSampler, vec2<f32>(u + b1 / n, v)).rgb;
  let graded = mix(rgb, mix(s0, s1, x.b - b0), lutUniforms.uIntensity);
  return vec4<f32>(graded * c.a, c.a);
}`;

/**
 * A Pixi filter that applies a look. Call update() before a render (never during
 * one); it returns the filter while the look is active, otherwise null.
 */
export function createColorLookFilter(): (look: ColorLookSettings | undefined) => Filter | null {
	let filter: Filter | null = null;
	let currentLut: LutTexture | null = null;
	const sources = new WeakMap<LutTexture, CanvasSource>();
	const sourceFor = (lut: LutTexture) => {
		let source = sources.get(lut);
		if (!source) {
			// Canvas upload instead of a raw buffer: the buffer upload sampled as
			// black in the software-GL smoke export, canvas textures work everywhere.
			const canvas = document.createElement("canvas");
			canvas.width = lut.size * lut.size;
			canvas.height = lut.size;
			canvas
				.getContext("2d")
				?.putImageData(new ImageData(new Uint8ClampedArray(lut.rgba), canvas.width, canvas.height), 0, 0);
			source = new CanvasSource({
				resource: canvas,
				scaleMode: "linear",
				autoGenerateMipmaps: false,
			});
			sources.set(lut, source);
		}
		return source;
	};
	return (look) => {
		const lut = getLookLut(look);
		if (!lut || !look) return null;
		if (!filter) {
			const source = sourceFor(lut);
			filter = new Filter({
				glProgram: GlProgram.from({
					vertex: glVertex,
					fragment: glFragment,
					name: "color-look",
				}),
				gpuProgram: GpuProgram.from({
					vertex: { source: wgslVertex, entryPoint: "mainVertex" },
					fragment: { source: wgslFragment, entryPoint: "mainFragment" },
				}),
				resources: {
					lutUniforms: {
						uLutSize: { value: lut.size, type: "f32" },
						uIntensity: { value: look.intensity, type: "f32" },
					},
					uLut: source,
					uLutSampler: source.style,
				},
				resolution: "inherit",
			});
			currentLut = lut;
		}
		const uniforms = filter.resources.lutUniforms.uniforms;
		if (lut !== currentLut) {
			const source = sourceFor(lut);
			filter.resources.uLut = source;
			filter.resources.uLutSampler = source.style;
			uniforms.uLutSize = lut.size;
			currentLut = lut;
		}
		uniforms.uIntensity = look.intensity;
		return filter;
	};
}
