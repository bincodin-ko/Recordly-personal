import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("HUD shows Restart while recording and the global shortcut starts a recording", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		const api = window.electronAPI as unknown as Record<string, unknown>;
		api.onRecordingStateChanged = (callback: (s: unknown) => void) => {
			const listener = () => callback({ recording: true, sourceName: "Built-in Display" });
			window.addEventListener("test-recording-started", listener);
			return () => window.removeEventListener("test-recording-started", listener);
		};
		// Main process would send this when the global shortcut fires.
		api.onRecordingShortcutToggle = (callback: () => void) => {
			window.addEventListener("test-global-shortcut", callback);
			return () => window.removeEventListener("test-global-shortcut", callback);
		};
		const getSelectedSource = api.getSelectedSource as () => Promise<unknown>;
		api.getSelectedSource = async () => {
			document.documentElement.dataset.shortcutStarted = "true";
			return getSelectedSource?.() ?? null;
		};
	});
	await page.goto("/?windowType=hud-overlay");
	await expect(page.getByRole("separator").first()).toBeVisible({ timeout: 45000 });

	await page.evaluate(() => window.dispatchEvent(new Event("test-global-shortcut")));
	await expect(page.locator("html")).toHaveAttribute("data-shortcut-started", "true");

	await page.evaluate(() => window.dispatchEvent(new Event("test-recording-started")));
	const controls = page.getByRole("group", { name: "Recording controls" });
	const restart = controls.getByRole("button", { name: "Restart recording", exact: true });
	await expect(restart).toBeVisible();
	const size = await restart.evaluate((el) => [
		(el as HTMLElement).offsetWidth,
		(el as HTMLElement).offsetHeight,
	]);
	expect(size).toEqual([36, 36]);
	await page.screenshot({ path: "test-results/hud-restart.png" });
});

test("shortcut settings list the global record shortcut and reject keys without Ctrl/Alt", async ({
	page,
}) => {
	test.setTimeout(120000);
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await page.getByRole("radio", { name: "Settings", exact: true }).click({ timeout: 60000 });
	await page.getByRole("button", { name: "Customize", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts", exact: true });
	await expect(dialog).toBeVisible();
	const change = dialog.getByRole("button", {
		name: /^Change Start \/ Stop Recording shortcut, currently /,
	});
	const before = (await change.textContent())!;
	expect(before).toMatch(/\+ 2$/); // default Ctrl/Cmd + Shift + 2
	await change.scrollIntoViewIfNeeded();
	await page.screenshot({ path: "test-results/shortcut-settings-record.png" });
	await change.click();
	await page.keyboard.press("r"); // no Ctrl/Alt -> rejected, binding unchanged
	await expect(change).toBeVisible();
	await expect(change).toHaveText(before);
	// Flag shortcut is reserved: Ctrl+Alt+F must not be assignable.
	await change.click();
	await page.keyboard.press("Control+Alt+f");
	await expect(change).toHaveText(before);
});
