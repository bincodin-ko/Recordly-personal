import { type RefObject, useEffect, useRef } from "react";
import {
	type ColorGradingSettings,
	getLookLut,
	MAX_CAMERA_SHARPEN_AMOUNT,
} from "@/lib/colorGrading";
import { createGradedVideoCanvas } from "@/lib/gradedVideoCanvas";

export function isCameraGradingActive(grading: ColorGradingSettings | undefined): boolean {
	return Boolean(grading && (getLookLut(grading.camera) || grading.cameraSharpness > 0));
}

/**
 * Preview twin of the export camera filters: redraws the webcam <video> through
 * the camera look + sharpen every animation frame. Render only while
 * isCameraGradingActive(); the caller hides the raw <video> meanwhile.
 */
export function GradedWebcamCanvas({
	videoRef,
	grading,
	className,
}: {
	videoRef: RefObject<HTMLVideoElement | null>;
	grading: ColorGradingSettings;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const gradingRef = useRef(grading);
	gradingRef.current = grading;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let renderer: ReturnType<typeof createGradedVideoCanvas> = null;
		try {
			renderer = createGradedVideoCanvas(canvas);
		} catch (error) {
			console.warn("[GradedWebcamCanvas] WebGL setup failed", error);
		}
		if (!renderer) return;
		let frame = 0;
		const tick = () => {
			const video = videoRef.current;
			const current = gradingRef.current;
			if (video) {
				renderer.draw(
					video,
					getLookLut(current.camera),
					current.camera.intensity,
					current.cameraSharpness * MAX_CAMERA_SHARPEN_AMOUNT,
				);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
		};
	}, [videoRef]);

	return <canvas ref={canvasRef} data-graded-webcam className={className} />;
}
