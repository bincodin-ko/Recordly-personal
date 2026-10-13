/** Pure helpers for the global (works while another app is focused) record shortcut. */
export interface GlobalBinding {
	key: string;
	/** Ctrl on Windows/Linux, Cmd on macOS */
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
}

const NAMED_KEYS: Record<string, string> = {
	" ": "Space",
	arrowup: "Up",
	arrowdown: "Down",
	arrowleft: "Left",
	arrowright: "Right",
	enter: "Return",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	home: "Home",
	end: "End",
	pageup: "PageUp",
	pagedown: "PageDown",
};

/** Electron accelerator string, or null when the binding cannot be a safe global shortcut. */
export function bindingToAccelerator(binding: GlobalBinding | null | undefined): string | null {
	if (!binding || typeof binding.key !== "string" || binding.key === "") return null;
	// A global shortcut with no Ctrl/Alt would steal plain typing in every app.
	if (!binding.ctrl && !binding.alt) return null;
	const key = binding.key.toLowerCase();
	let main: string | undefined = NAMED_KEYS[key];
	if (!main && /^[a-z0-9]$/.test(key)) main = key.toUpperCase();
	if (!main && /^f([1-9]|1[0-9]|2[0-4])$/.test(key)) main = key.toUpperCase();
	if (!main) return null;
	const parts: string[] = [];
	if (binding.ctrl) parts.push("CommandOrControl");
	if (binding.alt) parts.push("Alt");
	if (binding.shift) parts.push("Shift");
	parts.push(main);
	return parts.join("+");
}
