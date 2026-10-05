// Keyboard shortcut capture during a recording, saved next to the video as
// `<video>.keys.json` for the "show pressed keys" overlay.
// Privacy: plain typing is never stored — only combos with Ctrl/Alt/Win and a
// fixed set of non-text keys (Esc, Enter, Tab, arrows, F-keys, …).
import fs from "node:fs/promises";

export type KeystrokeSample = {
	timeMs: number;
	key: string;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
};

type HookKeyEvent = {
	keycode: number;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	metaKey?: boolean;
};

// uiohook-napi keycodes (libuiohook VC_* values).
const SPECIAL_KEYS: Record<number, string> = {
	1: "Esc",
	14: "Backspace",
	15: "Tab",
	28: "Enter",
	57: "Space",
	3655: "Home",
	3657: "PageUp",
	3663: "End",
	3665: "PageDown",
	3666: "Insert",
	3667: "Delete",
	57416: "↑",
	57419: "←",
	57421: "→",
	57424: "↓",
	59: "F1",
	60: "F2",
	61: "F3",
	62: "F4",
	63: "F5",
	64: "F6",
	65: "F7",
	66: "F8",
	67: "F9",
	68: "F10",
	87: "F11",
	88: "F12",
};
// Shown alone (without a modifier). Backspace/Space alone are typing, so excluded.
const STANDALONE_KEYS = new Set(
	Object.values(SPECIAL_KEYS).filter((name) => name !== "Backspace" && name !== "Space"),
);
const TEXT_KEYS: Record<number, string> = {
	2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
	16: "Q", 17: "W", 18: "E", 19: "R", 20: "T", 21: "Y", 22: "U", 23: "I", 24: "O", 25: "P",
	30: "A", 31: "S", 32: "D", 33: "F", 34: "G", 35: "H", 36: "J", 37: "K", 38: "L",
	44: "Z", 45: "X", 46: "C", 47: "V", 48: "B", 49: "N", 50: "M",
	12: "-", 13: "=", 26: "[", 27: "]", 39: ";", 40: "'", 41: "`", 43: "\\", 51: ",", 52: ".", 53: "/",
};
// Modifier keys themselves (Ctrl/Shift/Alt/Win left+right) are never a sample on their own.
const MODIFIER_KEYCODES = new Set([29, 3613, 42, 54, 56, 3640, 3675, 3676]);

const MAX_SAMPLES = 5000;
let activeSamples: KeystrokeSample[] = [];
let pendingSamples: KeystrokeSample[] = [];

/** Returns the sample to store, or null for typing/modifier-only presses. */
export function toKeystrokeSample(event: HookKeyEvent, timeMs: number): KeystrokeSample | null {
	if (MODIFIER_KEYCODES.has(event.keycode)) return null;
	const ctrl = Boolean(event.ctrlKey);
	const alt = Boolean(event.altKey);
	const meta = Boolean(event.metaKey);
	const shift = Boolean(event.shiftKey);
	const hasCommandModifier = ctrl || alt || meta;
	const special = SPECIAL_KEYS[event.keycode];
	const key = special ?? TEXT_KEYS[event.keycode];
	if (!key) return null;
	if (!hasCommandModifier && !(special && STANDALONE_KEYS.has(special))) return null;
	return { timeMs, key, ctrl, alt, shift, meta };
}

export function resetKeystrokeCapture() {
	activeSamples = [];
}

export function recordKeystroke(event: HookKeyEvent, timeMs: number) {
	const sample = toKeystrokeSample(event, timeMs);
	if (!sample) return;
	activeSamples.push(sample);
	if (activeSamples.length > MAX_SAMPLES) activeSamples.shift();
}

export function snapshotKeystrokesForPersistence() {
	const last = pendingSamples[pendingSamples.length - 1]?.timeMs ?? -1;
	pendingSamples = [...pendingSamples, ...activeSamples.filter((s) => s.timeMs > last)];
}

export async function persistPendingKeystrokes(videoPath: string) {
	if (pendingSamples.length > 0) {
		await fs.writeFile(
			`${videoPath}.keys.json`,
			JSON.stringify({ version: 1, samples: pendingSamples }, null, 2),
			"utf-8",
		);
	}
	pendingSamples = [];
}
