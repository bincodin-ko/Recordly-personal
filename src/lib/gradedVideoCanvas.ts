import { LUT_GLSL, type LutTexture } from "./colorGrading";

// Draws a <video> into a WebGL2 canvas with the same look LUT + sharpen math the
// export applies to the camera sprite (grade, then 4-tap unsharp at output-pixel
// spacing, which equals sharpening the resampled image like a Pixi filter does).

const vertex = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
    vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVideo;
uniform sampler2D uLut;
uniform float uLutSize;
uniform float uIntensity;
uniform float uSharp;
uniform vec2 uPixel;
${LUT_GLSL}
vec3 grade(vec2 uv) {
    vec3 c = texture(uVideo, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
    return uLutSize > 1.0 ? mix(c, applyLut(c), uIntensity) : c;
}
void main() {
    vec3 c = grade(vUv);
    if (uSharp > 0.0) {
        vec3 n = grade(vUv + vec2(uPixel.x, 0.0)) + grade(vUv - vec2(uPixel.x, 0.0))
            + grade(vUv + vec2(0.0, uPixel.y)) + grade(vUv - vec2(0.0, uPixel.y));
        c = c * (1.0 + 4.0 * uSharp) - n * uSharp;
    }
    outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export interface GradedVideoCanvas {
	draw(video: HTMLVideoElement, lut: LutTexture | null, intensity: number, sharp: number): void;
}

export function createGradedVideoCanvas(canvas: HTMLCanvasElement): GradedVideoCanvas | null {
	const gl = canvas.getContext("webgl2", {
		premultipliedAlpha: false,
		preserveDrawingBuffer: true,
	});
	if (!gl) return null;
	const compile = (type: number, src: string) => {
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
			throw new Error(gl.getShaderInfoLog(s) ?? "shader");
		return s;
	};
	const program = gl.createProgram()!;
	gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
	gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(program) ?? "link");
	}
	gl.useProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(program, "aPos");
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
	const u = (name: string) => gl.getUniformLocation(program, name);
	const makeTexture = (unit: number) => {
		const tex = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return tex;
	};
	const videoTex = makeTexture(0);
	const lutTex = makeTexture(1);
	gl.uniform1i(u("uVideo"), 0);
	gl.uniform1i(u("uLut"), 1);
	let uploadedLut: LutTexture | null = null;

	return {
		draw(video, lut, intensity, sharp) {
			const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
			const height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			gl.viewport(0, 0, width, height);
			if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, videoTex);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
			}
			if (lut && lut !== uploadedLut) {
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, lutTex);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					lut.size * lut.size,
					lut.size,
					0,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					lut.rgba,
				);
				uploadedLut = lut;
			}
			gl.uniform1f(u("uLutSize"), lut ? lut.size : 0);
			gl.uniform1f(u("uIntensity"), intensity);
			gl.uniform1f(u("uSharp"), sharp);
			gl.uniform2f(u("uPixel"), 1 / width, 1 / height);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
	};
}
