import { useSyncExternalStore } from "react";
import { loadAppSetting, saveAppSetting } from "./appSettings";

export type SettingsSide = "left" | "right";

const KEY = "recordly.editorSettingsSide";
const listeners = new Set<() => void>();

export function loadSettingsSide(): SettingsSide {
	const persisted = loadAppSetting<unknown>(KEY);
	if (persisted === "left" || persisted === "right") return persisted;
	try {
		const stored = globalThis.localStorage?.getItem(KEY);
		if (stored === "left" || stored === "right") return stored;
	} catch {
		// Ignore storage errors
	}
	return "right"; // Screen Studio default
}

let current: SettingsSide | null = null;
const get = () => (current ??= loadSettingsSide());

export function setSettingsSide(side: SettingsSide): void {
	current = side;
	saveAppSetting(KEY, side);
	try {
		globalThis.localStorage?.setItem(KEY, side);
	} catch {
		// Ignore storage errors
	}
	for (const l of listeners) l();
}

export function useSettingsSide(): SettingsSide {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		get,
		() => "right",
	);
}
