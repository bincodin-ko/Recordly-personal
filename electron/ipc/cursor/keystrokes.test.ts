import { describe, expect, it } from "vitest";
import { toKeystrokeSample } from "./keystrokes";

describe("toKeystrokeSample", () => {
	it("keeps shortcuts and special keys, drops plain typing and lone modifiers", () => {
		expect(toKeystrokeSample({ keycode: 46, ctrlKey: true }, 10)).toMatchObject({ key: "C", ctrl: true });
		expect(toKeystrokeSample({ keycode: 1 }, 10)).toMatchObject({ key: "Esc", ctrl: false });
		expect(toKeystrokeSample({ keycode: 59 }, 10)).toMatchObject({ key: "F1" });
		expect(toKeystrokeSample({ keycode: 46 }, 10)).toBeNull(); // plain "c"
		expect(toKeystrokeSample({ keycode: 46, shiftKey: true }, 10)).toBeNull(); // "C" typing
		expect(toKeystrokeSample({ keycode: 57 }, 10)).toBeNull(); // space typing
		expect(toKeystrokeSample({ keycode: 29, ctrlKey: true }, 10)).toBeNull(); // Ctrl alone
	});
});
