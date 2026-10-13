// B1 aspect auto, B2 zoom turn off, B3 shadow detail + inset (renderer only, Korean UI).
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
}

async function shot(page: Page, name: string) {
	await page.waitForTimeout(400);
	await page.screenshot({ path: path.join(screensDir, `${name}.png`), animations: "disabled" });
}

test.describe.configure({ timeout: 120000 });

test("B1 aspect menu opens on 자동 and offers all ratios", async ({ page }) => {
	await openEditor(page);
	const trigger = page.getByRole("button", { name: /^자동/ });
	await expect(trigger).toBeVisible();
	await trigger.click();
	for (const label of ["자동", "16:9", "9:16", "1:1", "4:3", "3:4"]) {
		await expect(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
	}
	await shot(page, "mimic-b1-aspect-menu");
	await page.getByRole("menuitem", { name: "1:1", exact: true }).click();
	await expect(page.getByRole("button", { name: /^1:1/ })).toBeVisible();
	await shot(page, "mimic-b1-aspect-square");
});

test("B2 zoom block can be turned off and on from the context menu, undo works", async ({ page }) => {
	await openEditor(page);
	await page.getByRole("button", { name: /줌 추가/ }).first().click();
	const item = page.locator('[data-timeline-item][data-variant="zoom"]');
	await expect(item).toBeVisible();
	await item.click({ button: "right" });
	await page.getByRole("menuitem", { name: "끄기", exact: true }).click();
	await expect(item).toHaveAttribute("data-zoom-disabled", "true");
	await expect(page.getByTestId("zoom-off-badge")).toBeVisible();
	await shot(page, "mimic-b2-zoom-off");
	await item.click({ button: "right" });
	await expect(page.getByRole("menuitem", { name: "켜기", exact: true })).toBeVisible();
	await page.getByRole("menuitem", { name: "켜기", exact: true }).click();
	await expect(item).not.toHaveAttribute("data-zoom-disabled", "true");
	// undo the re-enable -> off again
	await page.locator("body").click({ position: { x: 5, y: 5 } });
	await page.keyboard.press("Meta+z");
	await expect(item).toHaveAttribute("data-zoom-disabled", "true");
});

test("B3 shadow detail sliders and inset are in the 장면 tab and change the preview", async ({ page }) => {
	await openEditor(page);
	await page.getByRole("radio", { name: "장면", exact: true }).click();
	for (const label of ["각도", "거리", "부드러움", "안쪽 여백"]) {
		await page.getByRole("slider", { name: label }).scrollIntoViewIfNeeded();
		await expect(page.getByRole("slider", { name: label })).toBeVisible();
	}
	// First drop-shadow offset (x, y) of the preview canvas wrapper, parsed from the computed filter.
	const shadowOffset = () =>
		page.evaluate(() => {
			const el = Array.from(document.querySelectorAll<HTMLElement>("div.absolute.inset-0")).find(
				(n) => n.style.filter.includes("drop-shadow"),
			);
			const m = el?.style.filter.match(/rgba\([^)]*\) (-?[\d.]+)px (-?[\d.]+)px/);
			return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
		});
	const before = await shadowOffset();
	expect(before!.x).toBe(0);
	expect(before!.y).toBeGreaterThan(5);
	await shot(page, "mimic-b3-scene-before");
	const angle = page.getByRole("slider", { name: "각도" });
	await angle.focus();
	await page.keyboard.press("Home"); // 0 deg = shadow to the right
	await expect.poll(async () => (await shadowOffset())?.x ?? 0).toBeGreaterThan(5);
	expect(Math.abs((await shadowOffset())!.y)).toBeLessThan(0.01);
	const inset = page.getByRole("slider", { name: "안쪽 여백" });
	await inset.focus();
	for (let i = 0; i < 30; i += 1) await page.keyboard.press("ArrowRight");
	await page.getByRole("slider", { name: "안쪽 여백" }).scrollIntoViewIfNeeded();
	await shot(page, "mimic-b3-scene-after");
});
