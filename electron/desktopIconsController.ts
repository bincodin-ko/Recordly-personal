export type DesktopIconsMode = "hide" | "show" | "state";

export interface DesktopIconsDeps {
	run: (mode: DesktopIconsMode) => Promise<string>;
	runSync: (mode: DesktopIconsMode) => string;
	marker: { set: () => void; clear: () => void; exists: () => boolean };
}

/**
 * Hides icons only if they were visible (never "restores" icons the user hid in
 * Explorer). A marker file survives crashes so the next launch restores them.
 */
export function createDesktopIconsController(deps: DesktopIconsDeps) {
	let hiddenByUs = false;
	let queue: Promise<unknown> = Promise.resolve();
	const serial = (task: () => Promise<void>) => {
		const next = queue.then(task, task);
		queue = next.catch((error) => console.warn("[desktop-icons]", error));
		return queue as Promise<void>;
	};

	return {
		hide: () =>
			serial(async () => {
				if (hiddenByUs) return;
				deps.marker.set();
				hiddenByUs = true;
				if ((await deps.run("hide")) !== "hidden") {
					hiddenByUs = false;
					deps.marker.clear();
				}
			}),
		restore: () =>
			serial(async () => {
				if (!hiddenByUs && !deps.marker.exists()) return;
				await deps.run("show");
				hiddenByUs = false;
				deps.marker.clear();
			}),
		/** For app quit / startup: blocking, no queue. */
		restoreSync: () => {
			if (!hiddenByUs && !deps.marker.exists()) return;
			try {
				deps.runSync("show");
				hiddenByUs = false;
				deps.marker.clear();
			} catch (error) {
				// Marker stays, so the next launch tries again.
				console.warn("[desktop-icons] restore failed", error);
			}
		},
	};
}
