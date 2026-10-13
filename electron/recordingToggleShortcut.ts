import { globalShortcut } from "electron";
import { bindingToAccelerator } from "../src/lib/globalAccelerator";

const DEFAULT_BINDING = { key: "2", ctrl: true, shift: true };
let registered: string | null = null;

/** (Re)register the global record start/stop shortcut from a saved shortcuts.json object. */
export function applyRecordingToggleShortcut(
	saved: unknown,
	onTrigger: () => void,
): { success: boolean; accelerator: string | null } {
	if (registered) {
		globalShortcut.unregister(registered);
		registered = null;
	}
	const binding =
		(saved as { toggleRecording?: unknown } | null)?.toggleRecording ?? DEFAULT_BINDING;
	const accelerator = bindingToAccelerator(binding as Parameters<typeof bindingToAccelerator>[0]);
	if (!accelerator) return { success: false, accelerator: null };
	const ok = globalShortcut.register(accelerator, onTrigger);
	if (ok) registered = accelerator;
	return { success: ok, accelerator };
}

export function unregisterRecordingToggleShortcut() {
	if (registered) globalShortcut.unregister(registered);
	registered = null;
}
