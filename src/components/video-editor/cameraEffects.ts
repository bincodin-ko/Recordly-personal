// Camera background removal + face tracking, shared by the editor preview and every exporter.
// Runs MediaPipe Tasks Vision (selfie segmenter + BlazeFace) loaded on first use through
// window.electronAPI.loadCameraAiRuntime(); without it the camera is drawn unprocessed.
import type { WebcamOverlaySettings } from "./types";
import { getWebcamCropSourceRect } from "./webcamOverlay";

/** How far face tracking zooms in so the crop has room to follow the face. */
export const FACE_TRACKING_ZOOM = 1.3;
/** Time constant (seconds) of the face-follow smoothing. */
const FACE_TRACKING_SMOOTHING_SECONDS = 0.35;
const DETECTION_WIDTH = 320;

type CameraAiStatus = "idle" | "loading" | "ready" | "error";
interface MpMask {
	width: number;
	height: number;
	getAsFloat32Array(): Float32Array;
}
interface CameraVision {
	segmenter: {
		segment(image: CanvasImageSource): {
			confidenceMasks?: MpMask[];
			close(): void;
		};
	};
	face: {
		detect(image: CanvasImageSource): {
			detections: Array<{
				boundingBox?: { originX: number; originY: number; width: number; height: number };
			}>;
		};
	};
	delegate: "GPU" | "CPU";
}

let status: CameraAiStatus = "idle";
let vision: CameraVision | null = null;
let visionPromise: Promise<CameraVision | null> | null = null;
const statusListeners = new Set<() => void>();

function setStatus(next: CameraAiStatus) {
	status = next;
	for (const listener of statusListeners) listener();
}

export const getCameraAiStatus = () => status;
export function subscribeCameraAiStatus(listener: () => void) {
	statusListeners.add(listener);
	return () => {
		statusListeners.delete(listener);
	};
}

export function isCameraEffectsActive(webcam: WebcamOverlaySettings | null | undefined): boolean {
	return Boolean(webcam?.backgroundRemoval || webcam?.faceTracking);
}

/** A cut-out person has no box, so the box shadow is dropped (preview and export). */
export function hasTransparentCameraBackground(
	webcam: WebcamOverlaySettings | null | undefined,
): boolean {
	return Boolean(
		webcam?.backgroundRemoval && (webcam.backgroundStyle ?? "transparent") === "transparent",
	);
}

/** Loads (and on first use downloads) the MediaPipe runtime. Resolves null when unavailable. */
export function loadCameraAi(): Promise<CameraVision | null> {
	visionPromise ??= (async () => {
		setStatus("loading");
		try {
			const result = await window.electronAPI?.loadCameraAiRuntime?.();
			if (!result?.success || !result.files) {
				throw new Error(result?.error ?? "Camera AI runtime unavailable");
			}
			const files = result.files;
			const blobUrl = (bytes: Uint8Array, type: string) =>
				URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
			const mp = await import(/* @vite-ignore */ blobUrl(files.bundle, "text/javascript"));
			const fileset = {
				wasmLoaderPath: blobUrl(files.loader, "text/javascript"),
				wasmBinaryPath: blobUrl(files.wasm, "application/wasm"),
			};
			let delegate: "GPU" | "CPU" = "GPU";
			const create = async (
				task: { createFromOptions(fileset: object, options: object): Promise<unknown> },
				model: Uint8Array,
				extra: object,
			) => {
				try {
					return await task.createFromOptions(fileset, {
						baseOptions: { modelAssetBuffer: model, delegate },
						runningMode: "IMAGE",
						...extra,
					});
				} catch (error) {
					console.warn("[camera-ai] GPU delegate failed, using CPU:", error);
					delegate = "CPU";
					return task.createFromOptions(fileset, {
						baseOptions: { modelAssetBuffer: model, delegate },
						runningMode: "IMAGE",
						...extra,
					});
				}
			};
			const segmenter = await create(mp.ImageSegmenter, files.segmenter, {
				outputConfidenceMasks: true,
				outputCategoryMask: false,
			});
			const face = await create(mp.FaceDetector, files.face, {
				minDetectionConfidence: 0.5,
			});
			vision = { segmenter, face, delegate } as CameraVision;
			console.info(`[camera-ai] ready (${delegate} delegate)`);
			setStatus("ready");
			return vision;
		} catch (error) {
			console.warn("[camera-ai] unavailable:", error);
			visionPromise = null;
			setStatus("error");
			return null;
		}
	})();
	return visionPromise;
}

function make2d(width: number, height: number) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: false });
	if (!ctx) throw new Error("2D canvas unavailable");
	return { canvas, ctx };
}

function resize(canvas: HTMLCanvasElement, width: number, height: number) {
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
}

/**
 * Visible source rect for a bubble of `targetAspect`: cover-fit inside the user's crop, then,
 * with face tracking, zoomed by FACE_TRACKING_ZOOM and centred on `face` (clamped to the frame).
 */
export function getCameraEffectsSourceRect(
	sourceWidth: number,
	sourceHeight: number,
	cropRegion: WebcamOverlaySettings["cropRegion"] | undefined,
	targetAspect: number,
	face: { x: number; y: number } | null,
) {
	const base = getWebcamCropSourceRect(cropRegion, sourceWidth, sourceHeight);
	const aspect = targetAspect > 0 && Number.isFinite(targetAspect) ? targetAspect : 1;
	let sw = base.sw;
	let sh = base.sh;
	if (sw / sh > aspect) sw = sh * aspect;
	else sh = sw / aspect;
	const outWidth = Math.max(1, Math.round(sw));
	const outHeight = Math.max(1, Math.round(sh));
	let sx = base.sx + (base.sw - sw) / 2;
	let sy = base.sy + (base.sh - sh) / 2;
	if (face) {
		sw /= FACE_TRACKING_ZOOM;
		sh /= FACE_TRACKING_ZOOM;
		sx = Math.min(Math.max(face.x * sourceWidth - sw / 2, 0), sourceWidth - sw);
		sy = Math.min(Math.max(face.y * sourceHeight - sh / 2, 0), sourceHeight - sh);
	}
	return { sx, sy, sw, sh, outWidth, outHeight };
}

/** Exponential smoothing that is frame-rate independent; snaps after seeks or long gaps. */
export function smoothFaceCenter(
	previous: { x: number; y: number } | null,
	target: { x: number; y: number },
	dtSeconds: number | null,
): { x: number; y: number } {
	if (!previous || dtSeconds === null || dtSeconds < 0 || dtSeconds > 1) return target;
	const alpha = 1 - Math.exp(-dtSeconds / FACE_TRACKING_SMOOTHING_SECONDS);
	return {
		x: previous.x + (target.x - previous.x) * alpha,
		y: previous.y + (target.y - previous.y) * alpha,
	};
}

/** Per-consumer state (preview and each export keep their own face smoothing). */
export class CameraEffectsProcessor {
	private face: { x: number; y: number } | null = null;
	private lastTime: number | null = null;
	private detection = make2d(1, 1);
	private frame = make2d(1, 1);
	private person = make2d(1, 1);
	private mask = make2d(1, 1);

	reset() {
		this.face = null;
		this.lastTime = null;
	}

	/**
	 * Draws the processed, already-cropped camera image (aspect = targetAspect) into `out`.
	 * Mirroring, the bubble shape and the shadow stay with the caller.
	 */
	render(
		out: HTMLCanvasElement,
		source: CanvasImageSource,
		sourceWidth: number,
		sourceHeight: number,
		webcam: WebcamOverlaySettings,
		targetAspect: number,
		timeSeconds: number,
		/** Precomputed BiRefNet matte frame (white = person, same framing as `source`), export only. */
		matte?: CanvasImageSource | null,
	): void {
		const ai = vision;
		if (webcam.faceTracking && ai) {
			this.trackFace(ai, source, sourceWidth, sourceHeight, timeSeconds);
		} else {
			this.reset();
		}
		const rect = getCameraEffectsSourceRect(
			sourceWidth,
			sourceHeight,
			webcam.cropRegion,
			targetAspect,
			webcam.faceTracking && ai ? this.face : null,
		);
		const { outWidth: w, outHeight: h } = rect;
		resize(out, w, h);
		const outCtx = out.getContext("2d");
		if (!outCtx) return;

		if (!webcam.backgroundRemoval || (!ai && !matte)) {
			outCtx.clearRect(0, 0, w, h);
			outCtx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
			return;
		}

		resize(this.frame.canvas, w, h);
		this.frame.ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
		if (matte) this.drawMatte(matte, rect, sourceWidth, w, h);
		else if (ai) this.drawMask(ai, this.frame.canvas);

		resize(this.person.canvas, w, h);
		const p = this.person.ctx;
		p.globalCompositeOperation = "copy";
		p.drawImage(this.frame.canvas, 0, 0);
		p.globalCompositeOperation = "destination-in";
		p.imageSmoothingEnabled = true;
		p.imageSmoothingQuality = "high";
		p.drawImage(this.mask.canvas, 0, 0, w, h);
		p.globalCompositeOperation = "source-over";

		outCtx.clearRect(0, 0, w, h);
		const style = webcam.backgroundStyle ?? "transparent";
		if (style === "blur") {
			const blurPx = Math.max(4, Math.round(Math.min(w, h) * 0.04));
			outCtx.save();
			outCtx.filter = `blur(${blurPx}px)`;
			// Overdraw so the blur does not fade to transparent at the edges.
			outCtx.drawImage(
				this.frame.canvas,
				-blurPx * 2,
				-blurPx * 2,
				w + blurPx * 4,
				h + blurPx * 4,
			);
			outCtx.restore();
		} else if (style === "color") {
			outCtx.fillStyle = webcam.backgroundColor || "#FFFFFF";
			outCtx.fillRect(0, 0, w, h);
		}
		outCtx.drawImage(this.person.canvas, 0, 0);
	}

	private trackFace(
		ai: CameraVision,
		source: CanvasImageSource,
		sourceWidth: number,
		sourceHeight: number,
		timeSeconds: number,
	) {
		const dw = Math.min(DETECTION_WIDTH, sourceWidth);
		const dh = Math.max(1, Math.round((dw * sourceHeight) / sourceWidth));
		resize(this.detection.canvas, dw, dh);
		this.detection.ctx.drawImage(source, 0, 0, dw, dh);
		let best: { x: number; y: number; area: number } | null = null;
		try {
			for (const detection of ai.face.detect(this.detection.canvas).detections) {
				const box = detection.boundingBox;
				if (!box) continue;
				const area = box.width * box.height;
				if (!best || area > best.area) {
					best = {
						x: (box.originX + box.width / 2) / dw,
						y: (box.originY + box.height / 2) / dh,
						area,
					};
				}
			}
		} catch (error) {
			console.warn("[camera-ai] face detection failed:", error);
		}
		const dt = this.lastTime === null ? null : timeSeconds - this.lastTime;
		this.lastTime = timeSeconds;
		if (best) this.face = smoothFaceCenter(this.face, best, dt);
	}

	/** Crops the matte frame like the camera and turns its luminance into the alpha mask. */
	private drawMatte(
		matte: CanvasImageSource,
		rect: { sx: number; sy: number; sw: number; sh: number },
		sourceWidth: number,
		w: number,
		h: number,
	) {
		const m = matte as { displayWidth?: number; videoWidth?: number; width?: number };
		const matteWidth = m.displayWidth ?? m.videoWidth ?? m.width ?? sourceWidth;
		const k = matteWidth / sourceWidth;
		resize(this.mask.canvas, w, h);
		this.mask.ctx.drawImage(matte, rect.sx * k, rect.sy * k, rect.sw * k, rect.sh * k, 0, 0, w, h);
		const pixels = this.mask.ctx.getImageData(0, 0, w, h);
		const data = pixels.data;
		for (let i = 0; i < data.length; i += 4) data[i + 3] = data[i];
		this.mask.ctx.putImageData(pixels, 0, 0);
	}

	private drawMask(ai: CameraVision, image: HTMLCanvasElement) {
		const result = ai.segmenter.segment(image);
		try {
			const mask = result.confidenceMasks?.[0];
			if (!mask) return;
			const values = mask.getAsFloat32Array();
			resize(this.mask.canvas, mask.width, mask.height);
			const pixels = this.mask.ctx.createImageData(mask.width, mask.height);
			for (let i = 0; i < values.length; i++) {
				// Steepen the soft confidence edge so hair keeps detail but halos fade out.
				const a = Math.min(1, Math.max(0, (values[i] - 0.3) / 0.4));
				pixels.data[i * 4 + 3] = a * 255;
			}
			this.mask.ctx.putImageData(pixels, 0, 0);
		} finally {
			result.close();
		}
	}
}
