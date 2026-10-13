import { translate } from "@/contexts/I18nContext";
export const SHORTCUT_ACTIONS = [
	"addZoom",
	"splitClip",
	"addAnnotation",
	"addKeyframe",
	"deleteSelected",
	"playPause",
	"toggleRecording",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export interface ShortcutBinding {
	key: string;
	/** Maps to Cmd on macOS, Ctrl on Windows/Linux */
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
}

export type ShortcutsConfig = Record<ShortcutAction, ShortcutBinding>;

export interface FixedShortcut {
	label: string;
	display: string;
	bindings: ShortcutBinding[];
}

export const FIXED_SHORTCUTS: FixedShortcut[] = [
	// Held by electron/ipc/register/recording.ts (RECORDING_FLAG_SHORTCUT).
	{ get label() { return translate("shortcuts.actions.recordingFlag", "Recording Flag"); }, display: "Ctrl + Alt + F", bindings: [{ key: "f", ctrl: true, alt: true }] },
	{ get label() { return translate("shortcuts.actions.cycleForward", "Cycle Annotations Forward"); }, display: "Tab", bindings: [{ key: "tab" }] },
	{
		get label() { return translate("shortcuts.actions.cycleBackward", "Cycle Annotations Backward"); },
		display: "Shift + Tab",
		bindings: [{ key: "tab", shift: true }],
	},
	{
		get label() { return translate("shortcuts.actions.deleteSelectedAlt", "Delete Selected (alt)"); },
		display: "Del / ⌫",
		bindings: [{ key: "delete" }, { key: "backspace" }],
	},
	{ get label() { return translate("shortcuts.actions.panTimeline", "Pan Timeline"); }, display: "Shift + Scroll", bindings: [] },
	{ get label() { return translate("shortcuts.actions.zoomTimeline", "Zoom Timeline"); }, display: "Ctrl + Scroll", bindings: [] },
];

export type ShortcutConflict =
	| { type: "configurable"; action: ShortcutAction }
	| { type: "fixed"; label: string };

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
	return (
		a.key.toLowerCase() === b.key.toLowerCase() &&
		!!a.ctrl === !!b.ctrl &&
		!!a.shift === !!b.shift &&
		!!a.alt === !!b.alt
	);
}

export function findConflict(
	binding: ShortcutBinding,
	forAction: ShortcutAction,
	config: ShortcutsConfig,
): ShortcutConflict | null {
	for (const fixed of FIXED_SHORTCUTS) {
		if (fixed.bindings.some((b) => bindingsEqual(b, binding))) {
			return { type: "fixed", label: fixed.label };
		}
	}
	for (const action of SHORTCUT_ACTIONS) {
		if (action !== forAction && bindingsEqual(config[action], binding)) {
			return { type: "configurable", action };
		}
	}
	return null;
}

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
	addZoom: { key: "z" },
	splitClip: { key: "c" },
	addAnnotation: { key: "a" },
	addKeyframe: { key: "f" },
	deleteSelected: { key: "d", ctrl: true },
	playPause: { key: " " },
	// Global: works while another app is focused (registered in the main process).
	toggleRecording: { key: "2", ctrl: true, shift: true },
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
	get addZoom() { return translate("shortcuts.actions.addZoom", "Add Zoom"); },
	get splitClip() { return translate("shortcuts.actions.splitClip", "Split Clip"); },
	get addAnnotation() { return translate("shortcuts.actions.addAnnotation", "Add Annotation"); },
	get addKeyframe() { return translate("shortcuts.actions.addKeyframe", "Add Keyframe"); },
	get deleteSelected() { return translate("shortcuts.actions.deleteSelected", "Delete Selected"); },
	get playPause() { return translate("shortcuts.actions.playPause", "Play / Pause"); },
	get toggleRecording() { return translate("shortcuts.actions.toggleRecording", "Start / Stop Recording"); },
};

export function matchesShortcut(
	e: KeyboardEvent,
	binding: ShortcutBinding,
	isMacPlatform: boolean,
): boolean {
	if (e.key.toLowerCase() !== binding.key.toLowerCase()) return false;

	const primaryMod = isMacPlatform ? e.metaKey : e.ctrlKey;
	if (primaryMod !== !!binding.ctrl) return false;
	if (e.shiftKey !== !!binding.shift) return false;
	if (e.altKey !== !!binding.alt) return false;

	return true;
}

const KEY_LABELS: Record<string, string> = {
	" ": "Space",
	delete: "Del",
	backspace: "⌫",
	escape: "Esc",
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
};

export function formatBinding(binding: ShortcutBinding, isMac: boolean): string {
	const parts: string[] = [];
	if (binding.ctrl) parts.push(isMac ? "⌘" : "Ctrl");
	if (binding.shift) parts.push(isMac ? "⇧" : "Shift");
	if (binding.alt) parts.push(isMac ? "⌥" : "Alt");
	parts.push(KEY_LABELS[binding.key] ?? binding.key.toUpperCase());
	return parts.join(" + ");
}

export function mergeWithDefaults(partial: Partial<ShortcutsConfig>): ShortcutsConfig {
	const merged = { ...DEFAULT_SHORTCUTS };
	for (const action of SHORTCUT_ACTIONS) {
		if (partial[action]) {
			merged[action] = partial[action] as ShortcutBinding;
		}
	}
	return merged;
}
