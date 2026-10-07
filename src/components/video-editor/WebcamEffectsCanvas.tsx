import { type RefObject, useEffect, useRef } from "react";
import { CameraEffectsProcessor, loadCameraAi } from "./cameraEffects";
import type { WebcamOverlaySettings } from "./types";

type FrameCallbackVideo = HTMLVideoElement & {
	requestVideoFrameCallback?: (callback: () => void) => number;
	cancelVideoFrameCallback?: (handle: number) => void;
};

/** Preview of the processed camera (background removal / face tracking) drawn over the bubble. */
export function WebcamEffectsCanvas({
	videoRef,
	webcam,
	targetAspect,
}: {
	videoRef: RefObject<HTMLVideoElement | null>;
	webcam: WebcamOverlaySettings;
	targetAspect: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const processorRef = useRef<CameraEffectsProcessor | null>(null);

	useEffect(() => {
		const video = videoRef.current as FrameCallbackVideo | null;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;
		processorRef.current ??= new CameraEffectsProcessor();
		const processor = processorRef.current;
		let cancelled = false;
		let handle: number | null = null;

		const draw = () => {
			if (cancelled || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
			const started = performance.now();
			processor.render(
				canvas,
				video,
				video.videoWidth,
				video.videoHeight,
				webcam,
				targetAspect,
				video.currentTime,
			);
			// Diagnostics: last preview processing times (ms), read by smoke checks.
			const diagnostics = globalThis as { __recordlyCameraEffectsMs?: number[] };
			diagnostics.__recordlyCameraEffectsMs ??= [];
			const timings = diagnostics.__recordlyCameraEffectsMs;
			timings.push(performance.now() - started);
			if (timings.length > 240) timings.shift();
		};
		const loop = () => {
			draw();
			if (!cancelled && video.requestVideoFrameCallback) {
				handle = video.requestVideoFrameCallback(loop);
			}
		};

		loop();
		void loadCameraAi().then(() => draw());
		video.addEventListener("seeked", draw);
		video.addEventListener("loadeddata", draw);
		return () => {
			cancelled = true;
			if (handle !== null) video.cancelVideoFrameCallback?.(handle);
			video.removeEventListener("seeked", draw);
			video.removeEventListener("loadeddata", draw);
		};
	}, [videoRef, webcam, targetAspect]);

	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 block h-full w-full"
			aria-hidden="true"
		/>
	);
}
