// Full-page screenshots of key screens for `npm run verify` design review (.verify/screens).
// Uses the real default locale (Korean); other specs pin English via the bridge.
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const screensDir = process.env.VERIFY_SCREENS_DIR ?? path.join(".verify", "screens");
const tabs = ["장면", "줌", "커서", "카메라", "오디오", "자막", "설정"];

async function open(page: Page, windowType: string) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem("recordly.locale", "ko");
		} catch {}
	});
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto(`/?windowType=${windowType}`);
}

async function shot(page: Page, name: string) {
	const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
	await page.waitForTimeout(400); // let enter animations settle
	await page.screenshot({
		path: path.join(screensDir, `${name}-${width}x${height}.png`),
		fullPage: true,
		animations: "disabled",
	});
}

async function openEditor(page: Page) {
	await open(page, "editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 60000,
	});
}

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 1280, height: 800 },
]) {
	test.describe(`screens ${viewport.width}x${viewport.height}`, () => {
		test.use({ viewport });
		test.describe.configure({ timeout: 120000 });

		test("editor settings tabs", async ({ page }) => {
			await openEditor(page);
			for (const [index, tab] of tabs.entries()) {
				await page.getByRole("radio", { name: tab, exact: true }).click();
				await expect(page.getByRole("radio", { name: tab, exact: true })).toBeChecked();
				await shot(page, `editor-${index + 1}-${tab}`);
			}
		});

		test("export dialog", async ({ page }) => {
			await openEditor(page);
			await page.getByRole("button", { name: "내보내기", exact: true }).click();
			await expect(page.getByRole("dialog").or(page.getByRole("menu")).first()).toBeVisible();
			await shot(page, "export-dialog");
		});

		test("command menu", async ({ page }) => {
			await openEditor(page);
			await page.locator("body").click({ position: { x: 5, y: 5 } });
			await page.keyboard.press("Meta+k"); // bridge reports macOS, so the shortcut is Cmd+K
			await expect(page.getByRole("dialog").first()).toBeVisible();
			await shot(page, "command-menu");
		});

		test("clip context menu", async ({ page }) => {
			await openEditor(page);
			await page.locator('[data-variant="clip"]').click({ button: "right", position: { x: 100, y: 20 } });
			await expect(page.getByRole("menu").first()).toBeVisible();
			await shot(page, "clip-context-menu");
		});

		for (const windowType of ["hud-overlay", "quick-export", "prompter", "source-selector", "countdown", "update-toast"]) {
			test(`window ${windowType}`, async ({ page }) => {
				await open(page, windowType);
				// Some windows (e.g. source-selector) may legitimately render nothing without real sources.
				await page.waitForLoadState("networkidle");
				await page.waitForTimeout(1500);
				await shot(page, `window-${windowType}`);
			});
		}
	});
}
