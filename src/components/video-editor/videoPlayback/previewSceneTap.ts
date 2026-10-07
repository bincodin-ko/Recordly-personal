/**
 * Lets DOM overlays (pixelate annotations) sample the Pixi preview canvas right after
 * each render, while its WebGL drawing buffer is still valid.
 */
type SceneListener = (canvas: HTMLCanvasElement) => void;

const listeners = new Set<SceneListener>();

export function subscribePreviewScene(listener: SceneListener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function emitPreviewScene(canvas: HTMLCanvasElement) {
	for (const listener of listeners) listener(canvas);
}
