import { test } from "@playwright/test";
import fs from "node:fs";
import { installDesktopBridge } from "./bridge";
test("probe", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		window.electronAPI.getRecordingPreferences = async () => ({ success: true, webcamEnabled: true, microphoneEnabled: false, systemAudioEnabled: false });
		window.electronAPI.onRecordingStateChanged = (callback) => {
			const listener = () => callback({ recording: true, sourceName: "Built-in Display" });
			window.addEventListener("test-recording-started", listener);
			return () => window.removeEventListener("test-recording-started", listener);
		};
	});
	await page.goto("/?windowType=hud-overlay");
	await page.waitForTimeout(3000);
	const list = () => page.evaluate(() => [...document.querySelectorAll("button")].map((b) => `${b.getAttribute("aria-label") || b.innerText.trim()} ${b.offsetWidth}x${b.offsetHeight}`));
	const idle = await list();
	await page.evaluate(() => window.dispatchEvent(new Event("test-recording-started")));
	await page.waitForTimeout(1500);
	const rec = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Recording controls"] button')].map((b) => `${b.getAttribute("aria-label") || b.innerText.trim()} ${b.offsetWidth}x${b.offsetHeight}`));
	fs.writeFileSync(".verify/probe.json", JSON.stringify({ idle, rec }, null, 1));
});
