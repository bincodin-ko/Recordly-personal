import { type Container, Filter, GlProgram, GpuProgram, Matrix, type Sprite } from "pixi.js";

// Bilinear resampling of the screen recording at any non-1:1 scale (padding,
// preview fit, zoom) cost ~25% edge contrast on small UI text. A light 4-tap
// unsharp pass after resampling restores it; amount 0.12 matched a Lanczos
// resize best across 0.5x-0.96x scales on real recordings (qa/ measurements).
const SHARPEN_AMOUNT = 0.12;
const NATIVE_SCALE_TOLERANCE = 0.01;
// Below ~0.8x GPU bilinear sampling is already aliased (crisp-but-jaggy); sharpening
// there made a 0.57x editor preview worse vs a Lanczos reference (err 4.54 -> 5.84).
const MIN_SHARPEN_SCALE = 0.8;

export const glVertex = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

// highp must match the vertex stage for shared uniforms (uInputSize), or WebGL fails to link.
const glFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uAmount;
vec4 tap(vec2 offset) {
    return texture(uTexture, clamp(vTextureCoord + offset * uInputSize.zw, uInputClamp.xy, uInputClamp.zw));
}
void main(void)
{
    vec4 c = texture(uTexture, vTextureCoord);
    vec4 n = tap(vec2(1.0, 0.0)) + tap(vec2(-1.0, 0.0)) + tap(vec2(0.0, 1.0)) + tap(vec2(0.0, -1.0));
    vec3 rgb = c.rgb * (1.0 + 4.0 * uAmount) - n.rgb * uAmount;
    finalColor = vec4(clamp(rgb, vec3(0.0), vec3(c.a)), c.a);
}`;

// WGSL kept in the same shape as pixi-filters' default vertex (Pixi parses its
// attribute signature; a combined module failed with "attribute slot 0 not present").
export const wgslVertex = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>
  };

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>, 
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition)
  );
}`;

const wgslFragment = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct SharpenUniforms {
  uAmount: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> sharpenUniforms : SharpenUniforms;

fn tap(uv: vec2<f32>, offset: vec2<f32>) -> vec4<f32> {
  return textureSample(uTexture, uSampler, clamp(uv + offset * gfu.uInputSize.zw, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
  let k = sharpenUniforms.uAmount;
  let c = textureSample(uTexture, uSampler, uv);
  let n = tap(uv, vec2<f32>(1.0, 0.0)) + tap(uv, vec2<f32>(-1.0, 0.0)) + tap(uv, vec2<f32>(0.0, 1.0)) + tap(uv, vec2<f32>(0.0, -1.0));
  let rgb = c.rgb * (1.0 + 4.0 * k) - n.rgb * k;
  return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(c.a)), c.a);
}`;

export function createVideoSharpenFilter(amount = SHARPEN_AMOUNT): Filter {
	return new Filter({
		glProgram: GlProgram.from({ vertex: glVertex, fragment: glFragment, name: "video-sharpen" }),
		gpuProgram: GpuProgram.from({
			vertex: { source: wgslVertex, entryPoint: "mainVertex" },
			fragment: { source: wgslFragment, entryPoint: "mainFragment" },
		}),
		resources: { sharpenUniforms: { uAmount: { value: amount, type: "f32" } } },
		resolution: "inherit",
	});
}

/**
 * Sharpen the recording only while it is drawn at a non-native pixel scale.
 * At exactly 1:1 the filter is removed so the output stays pixel-identical.
 * Call the returned update() right before each render (never during one:
 * swapping filters mid-render blanked the whole frame).
 */
export function createVideoSharpener(
	sprite: Sprite,
	getResolution: () => number,
	getLeadingFilters: () => Filter[] = () => [],
): () => void {
	const filter = createVideoSharpenFilter();
	const matrix = new Matrix();
	return () => {
		if (sprite.destroyed) return;
		const m = sprite.getGlobalTransform(matrix, false);
		const scale = Math.hypot(m.a, m.b) * getResolution();
		const native = Math.abs(scale - 1) < NATIVE_SCALE_TOLERANCE || scale < MIN_SHARPEN_SCALE;
		const next = getLeadingFilters();
		if (!native) next.push(filter);
		syncSpriteFilters(sprite, next);
	};
}

/** Assign filters only when the list changed (reassigning every frame re-allocates passes). */
export function syncSpriteFilters(sprite: Container, next: Filter[]): void {
	const current = (sprite.filters ?? []) as readonly Filter[];
	if (current.length === next.length && current.every((f, i) => f === next[i])) return;
	sprite.filters = next.length > 0 ? next : null;
}
