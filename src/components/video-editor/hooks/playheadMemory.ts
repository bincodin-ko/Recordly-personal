/**
 * Screen Studio reopens a project where you left the playhead. Kept per recording in
 * localStorage (not the project file) so moving the playhead never marks the project unsaved.
 */
const PREFIX = "recordly.playhead:";

type Store = Pick<Storage, "getItem" | "setItem">;

export function savePlayhead(store: Store, key: string, seconds: number) {
	try {
		store.setItem(PREFIX + key, String(Math.max(0, seconds)));
	} catch {
		/* storage full or blocked: just don't remember */
	}
}

/** Saved playhead if it still fits inside the timeline (not at the very end), else null. */
export function loadPlayhead(store: Store, key: string, durationSeconds: number): number | null {
	try {
		const seconds = Number(store.getItem(PREFIX + key));
		return seconds > 0 && seconds < durationSeconds - 0.05 ? seconds : null;
	} catch {
		return null;
	}
}
