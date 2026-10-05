import { describe, expect, it } from "vitest";
import { createDesktopIconsController, type DesktopIconsMode } from "./desktopIconsController";

function setup(initiallyVisible = true, markerExists = false) {
	let visible = initiallyVisible;
	let marker = markerExists;
	const calls: DesktopIconsMode[] = [];
	const apply = (mode: DesktopIconsMode) => {
		calls.push(mode);
		if (mode === "hide") {
			if (!visible) return "already-hidden";
			visible = false;
		}
		if (mode === "show") visible = true;
		return visible ? "visible" : "hidden";
	};
	const controller = createDesktopIconsController({
		run: async (mode) => apply(mode),
		runSync: apply,
		marker: {
			set: () => {
				marker = true;
			},
			clear: () => {
				marker = false;
			},
			exists: () => marker,
		},
	});
	return { controller, calls, state: () => ({ visible, marker }) };
}

describe("desktop icons controller", () => {
	it("hides and restores, leaving no crash marker", async () => {
		const { controller, state } = setup();
		await controller.hide();
		expect(state()).toEqual({ visible: false, marker: true });
		await controller.restore();
		expect(state()).toEqual({ visible: true, marker: false });
	});

	it("never shows icons the user had already hidden", async () => {
		const { controller, state, calls } = setup(false);
		await controller.hide();
		await controller.restore();
		expect(state()).toEqual({ visible: false, marker: false });
		expect(calls).toEqual(["hide"]);
	});

	it("restore queued right after hide still ends visible", async () => {
		const { controller, state } = setup();
		void controller.hide();
		await controller.restore();
		expect(state().visible).toBe(true);
	});

	it("restores on startup after a crash left the marker", () => {
		const { controller, state } = setup(false, true);
		controller.restoreSync();
		expect(state()).toEqual({ visible: true, marker: false });
	});
});
