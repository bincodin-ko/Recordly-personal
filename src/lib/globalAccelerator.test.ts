import { describe, expect, it } from "vitest";
import { bindingToAccelerator } from "./globalAccelerator";

describe("bindingToAccelerator", () => {
	it("maps the default Ctrl+Shift+2", () => {
		expect(bindingToAccelerator({ key: "2", ctrl: true, shift: true })).toBe(
			"CommandOrControl+Shift+2",
		);
	});
	it("maps letters, function and named keys", () => {
		expect(bindingToAccelerator({ key: "r", ctrl: true, alt: true })).toBe(
			"CommandOrControl+Alt+R",
		);
		expect(bindingToAccelerator({ key: "f9", alt: true })).toBe("Alt+F9");
		expect(bindingToAccelerator({ key: " ", ctrl: true })).toBe("CommandOrControl+Space");
	});
	it("rejects bindings without Ctrl/Alt (would steal plain typing)", () => {
		expect(bindingToAccelerator({ key: "r" })).toBeNull();
		expect(bindingToAccelerator({ key: "r", shift: true })).toBeNull();
	});
	it("rejects unknown keys and empty input", () => {
		expect(bindingToAccelerator({ key: "@", ctrl: true })).toBeNull();
		expect(bindingToAccelerator({ key: "", ctrl: true })).toBeNull();
		expect(bindingToAccelerator(null)).toBeNull();
	});
});
