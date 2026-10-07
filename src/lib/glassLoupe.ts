import { type Container, Filter, type FilterSystem, GlProgram, GpuProgram } from "pixi.js";
import type { SceneLoupeTarget } from "@/components/video-editor/videoPlayback/sceneMotion";
import { glVertex, syncSpriteFilters, wgslVertex } from "./videoSharpenFilter";

// Screen Studio "Glass Loupe": the frame stays put and a round glass lens magnifies
// the area under the cursor. Lens size is relative to the output so preview and
// export look the same at any resolution.
const LOUPE_RADIUS_OF_SHORT_SIDE = 0.17;

// Shared math, written once per language. Everything is in global (stage) px:
// p = this pixel, uCenter = lens center. Premultiplied alpha throughout.
const glFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec2 uOrigin;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uMag;
uniform float uAlpha;

vec4 sampleAt(vec2 g) {
    vec2 uv = (g - uOrigin) * uInputSize.zw;
    vec2 c = clamp(uv, uInputClamp.xy, uInputClamp.zw);
    vec2 off = abs(uv - c) * uInputSize.xy;
    return texture(uTexture, c) * (1.0 - clamp(max(off.x, off.y), 0.0, 1.0));
}
vec4 over(vec4 src, vec4 dst) { return src + dst * (1.0 - src.a); }

void main(void)
{
    vec2 p = vTextureCoord * uInputSize.xy + uOrigin;
    vec4 base = texture(uTexture, vTextureCoord);
    float R = uRadius;
    vec2 d = p - uCenter;
    float r = length(d);
    float rn = r / R;
    float hair = max(R * 0.01, 1.0);
    // Soft drop shadow, slightly below the lens.
    float sd = length(d - vec2(0.0, R * 0.05));
    float shadow = (1.0 - smoothstep(R * 0.9, R * 1.2, sd)) * 0.32;
    vec4 col = over(vec4(0.0, 0.0, 0.0, shadow * uAlpha), base);
    float outer = (1.0 - smoothstep(0.0, hair, abs(r - R - hair * 0.5))) * 0.25;
    col = over(vec4(0.0, 0.0, 0.0, outer * uAlpha), col);
    // Magnified content; a little barrel toward the rim reads as curved glass.
    vec4 lens = sampleAt(uCenter + d / uMag * (1.0 + 0.1 * rn * rn));
    lens.rgb *= 1.0 - 0.16 * smoothstep(0.75, 1.0, rn);
    float light = max(dot(d / max(r, 0.0001), vec2(-0.6, -0.8)), 0.0);
    float hi = smoothstep(0.86, 0.97, rn) * light * light * 0.5
        + (1.0 - smoothstep(0.1, 0.75, length(d / R - vec2(-0.3, -0.42)))) * 0.08;
    lens = over(vec4(hi), lens);
    float ring = (1.0 - smoothstep(hair * 0.5, hair * 1.5, abs(r - R + hair))) * 0.5;
    lens = over(vec4(ring * 0.9), lens);
    float inside = 1.0 - smoothstep(R - 1.0, R, r);
    finalColor = mix(col, lens, inside * uAlpha);
}`;

const wgslFragment = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct LoupeUniforms {
  uOrigin: vec2<f32>,
  uCenter: vec2<f32>,
  uRadius: f32,
  uMag: f32,
  uAlpha: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> loupeUniforms : LoupeUniforms;

fn sampleAt(g: vec2<f32>) -> vec4<f32> {
  let uv = (g - loupeUniforms.uOrigin) * gfu.uInputSize.zw;
  let c = clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw);
  let off = abs(uv - c) * gfu.uInputSize.xy;
  return textureSampleLevel(uTexture, uSampler, c, 0.0) * (1.0 - clamp(max(off.x, off.y), 0.0, 1.0));
}
fn over(src: vec4<f32>, dst: vec4<f32>) -> vec4<f32> { return src + dst * (1.0 - src.a); }

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
  let u = loupeUniforms;
  let p = uv * gfu.uInputSize.xy + u.uOrigin;
  let base = textureSampleLevel(uTexture, uSampler, uv, 0.0);
  let R = u.uRadius;
  let d = p - u.uCenter;
  let r = length(d);
  let rn = r / R;
  let hair = max(R * 0.01, 1.0);
  let sd = length(d - vec2<f32>(0.0, R * 0.05));
  let shadow = (1.0 - smoothstep(R * 0.9, R * 1.2, sd)) * 0.32;
  var col = over(vec4<f32>(0.0, 0.0, 0.0, shadow * u.uAlpha), base);
  let outer = (1.0 - smoothstep(0.0, hair, abs(r - R - hair * 0.5))) * 0.25;
  col = over(vec4<f32>(0.0, 0.0, 0.0, outer * u.uAlpha), col);
  var lens = sampleAt(u.uCenter + d / u.uMag * (1.0 + 0.1 * rn * rn));
  lens = vec4<f32>(lens.rgb * (1.0 - 0.16 * smoothstep(0.75, 1.0, rn)), lens.a);
  let light = max(dot(d / max(r, 0.0001), vec2<f32>(-0.6, -0.8)), 0.0);
  let hi = smoothstep(0.86, 0.97, rn) * light * light * 0.5
    + (1.0 - smoothstep(0.1, 0.75, length(d / R - vec2<f32>(-0.3, -0.42)))) * 0.08;
  lens = over(vec4<f32>(hi), lens);
  let ring = (1.0 - smoothstep(hair * 0.5, hair * 1.5, abs(r - R + hair))) * 0.5;
  lens = over(vec4<f32>(ring * 0.9), lens);
  let inside = 1.0 - smoothstep(R - 1.0, R, r);
  return mix(col, lens, inside * u.uAlpha);
}`;

type LoupeUniforms = {
	uOrigin: Float32Array;
	uCenter: Float32Array;
	uRadius: number;
	uMag: number;
	uAlpha: number;
};

type GlassLoupeFilter = Filter & { uniforms: LoupeUniforms };

function createGlassLoupeFilter(): GlassLoupeFilter {
	const filter = new Filter({
		glProgram: GlProgram.from({ vertex: glVertex, fragment: glFragment, name: "glass-loupe" }),
		gpuProgram: GpuProgram.from({
			vertex: { source: wgslVertex, entryPoint: "mainVertex" },
			fragment: { source: wgslFragment, entryPoint: "mainFragment" },
		}),
		resources: {
			loupeUniforms: {
				uOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
				uCenter: { value: new Float32Array(2), type: "vec2<f32>" },
				uRadius: { value: 1, type: "f32" },
				uMag: { value: 1, type: "f32" },
				uAlpha: { value: 0, type: "f32" },
			},
		},
		resolution: "inherit",
	}) as GlassLoupeFilter;
	const uniforms = filter.resources.loupeUniforms.uniforms as LoupeUniforms;
	filter.uniforms = uniforms;
	filter.apply = (filterManager: FilterSystem, input, output, clearMode) => {
		// The input texture covers the filter bounds; their top-left maps texture px to stage px.
		// ponytail: reads Pixi's private filter state (8.14); re-check on a Pixi upgrade.
		const bounds = (
			filterManager as unknown as {
				_activeFilterData?: { bounds: { minX: number; minY: number } };
			}
		)._activeFilterData?.bounds;
		uniforms.uOrigin[0] = bounds?.minX ?? 0;
		uniforms.uOrigin[1] = bounds?.minY ?? 0;
		filterManager.applyFilter(filter, input, output, clearMode);
	};
	return filter;
}

type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };

/**
 * Glass Loupe on `target` (the camera container: video + cursor). Call the returned
 * sync right before each render; the filter is only attached while a loupe is active
 * so frames without one stay pixel-identical.
 */
export function createGlassLoupe(target: Container) {
	let filter: GlassLoupeFilter | null = null;
	return (
		loupe: SceneLoupeTarget | undefined,
		stage: Size,
		mask: Rect,
		cursor: {
			container: Container;
			getLastRenderedPoint(): { px: number; py: number } | null;
		} | null,
	): void => {
		if (target.destroyed) return;
		if (!loupe || loupe.strength <= 0 || stage.width <= 0 || stage.height <= 0) {
			syncSpriteFilters(target, []);
			return;
		}
		filter ??= createGlassLoupeFilter();
		const tip = loupe.followCursor ? cursor?.getLastRenderedPoint() : null;
		const center =
			tip && cursor
				? cursor.container.toGlobal({ x: tip.px, y: tip.py })
				: target.toGlobal({
						x: mask.x + loupe.focus.cx * mask.width,
						y: mask.y + loupe.focus.cy * mask.height,
					});
		const s = Math.min(1, loupe.strength);
		const radius =
			Math.min(stage.width, stage.height) * LOUPE_RADIUS_OF_SHORT_SIDE * (0.6 + 0.4 * s);
		const u = filter.uniforms;
		u.uCenter[0] = center.x;
		u.uCenter[1] = center.y;
		u.uRadius = radius;
		u.uMag = 1 + (loupe.scale - 1) * s;
		u.uAlpha = s;
		// Room for the lens and its shadow beyond the content bounds (e.g. near a video edge).
		filter.padding = Math.ceil(radius * 1.25 + 4);
		syncSpriteFilters(target, [filter]);
	};
}
