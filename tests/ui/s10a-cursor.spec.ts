// s10-a: per-clip "disable smooth mouse movement", ripple click default, cursor Advanced toggles (renderer-only).
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const screensDir = process.env.VERIFY_SCREENS_DIR ?? path.join(".verify", "screens");

async function openEditor(page: Page) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem("recordly.locale", "ko");
		} catch {
			// storage unavailable
		}
	});
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 60000,
	});
	await expect(page.getByLabel("Loading preview")).toHaveCount(0);
}

async function shot(page: Page, name: string) {
	await page.waitForTimeout(400);
	await page.screenshot({ path: path.join(screensDir, `${name}.png`), animations: "disabled" });
}

test.use({ viewport: { width: 1280, height: 800 } });

test("clip toggle: disable smooth mouse movement shows a badge and undo removes it", async ({ page }) => {
	await openEditor(page);
	await page.locator('[data-variant="clip"]').first().click();
	const toggle = page.getByTestId("clip-disable-smooth-cursor");
	await expect(toggle).toBeVisible();
	await expect(page.getByTestId("clip-raw-cursor-badge")).toHaveCount(0);
	await toggle.click();
	await expect(page.getByTestId("clip-raw-cursor-badge")).toBeVisible();
	await shot(page, "s10a-clip-raw-cursor-on");
	await page.locator("[data-timeline-panel]").focus();
	await page.keyboard.press("Meta+z");
	await expect(page.getByTestId("clip-raw-cursor-badge")).toHaveCount(0);
});

test("cursor tab: ripple is the default click effect and Advanced toggles work", async ({ page }) => {
	await openEditor(page);
	await page.getByRole("radio", { name: "커서", exact: true }).click();
	await page.waitForTimeout(800);
	await expect(page.getByRole("row", { name: "물결", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(page.getByRole("row", { name: "없음", exact: true })).toHaveAttribute("aria-selected", "false");
	for (const id of ["cursor-always-default", "cursor-stop-at-end", "cursor-remove-shakes"]) {
		const sw = page.getByTestId(id);
		await sw.scrollIntoViewIfNeeded();
		await expect(sw).toBeVisible();
		await expect(sw.locator("input")).not.toBeChecked();
		await sw.click();
		await expect(sw.locator("input")).toBeChecked();
	}
	await page.getByTestId("cursor-remove-shakes").scrollIntoViewIfNeeded();
	await shot(page, "s10a-cursor-tab-advanced");
});
