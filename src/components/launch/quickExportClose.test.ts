import { describe, expect, it } from "vitest";
import { shouldOpenEditorOnWidgetClose } from "./quickExportClose";

describe("shouldOpenEditorOnWidgetClose", () => {
	it("is on by default and when true", () => {
		expect(shouldOpenEditorOnWidgetClose(null)).toBe(true);
		expect(shouldOpenEditorOnWidgetClose(undefined)).toBe(true);
		expect(shouldOpenEditorOnWidgetClose(true)).toBe(true);
	});
	it("is off only when explicitly false", () => {
		expect(shouldOpenEditorOnWidgetClose(false)).toBe(false);
	});
});
