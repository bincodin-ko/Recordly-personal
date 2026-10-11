import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const OUT = process.env.S8F2_OUT ?? "test-results";

test("editor brightness and settings-panel side are configurable and persist", async ({ page }) => {
	await installDesktopBridge(page);
	await page.addInitScript(() => {
		localStorage.setItem("recordly.locale", "ko");
		// Stale bridge: add any missing subscribe-style stubs.
		const api = (window as any).electronAPI;
		api.onVoiceoverProgress ??= () => () => undefined;
	});
	await page.goto("/?windowType=editor");
	const nav = page.locator("div:has(> aside.editor-inspector) > nav");
	await expect(nav).toBeVisible({ timeout: 20000 });
	const html = page.locator("html");
	await expect(html).toHaveClass(/dark/); // default = dark

	const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	const openSettings = async () => {
		await page.getByLabel("설정", { exact: true }).click();
	};
	const xs = async () => ({
		panel: (await page.locator("aside.editor-inspector").boundingBox())!.x,
		rail: (await nav.boundingBox())!.x,
		preview: (await page.locator("canvas").first().boundingBox())!.x,
	});
	await openSettings();
	await expect(page.getByRole("row", { name: "다크", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(page.getByRole("row", { name: "오른쪽", exact: true })).toHaveAttribute("aria-selected", "true");

	for (const theme of ["라이트", "다크"] as const) {
		for (const side of ["왼쪽", "오른쪽"] as const) {
			await page.getByRole("row", { name: theme, exact: true }).click();
			await page.getByRole("row", { name: side, exact: true }).click();
			const dark = theme === "다크";
			await expect(html).toHaveClass(dark ? /dark/ : /^(?!.*dark)/);
			const c = await bg();
			const lum = c.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
			expect(dark ? lum < 40 : lum > 200).toBe(true);
			const p = await xs();
			if (side === "왼쪽") {
				expect(p.rail).toBeLessThan(p.panel);
				expect(p.panel).toBeLessThan(p.preview);
			} else {
				expect(p.preview).toBeLessThan(p.panel);
				expect(p.panel).toBeLessThan(p.rail);
			}
			await page.mouse.move(0, 0);
			await page.screenshot({
				path: `${OUT}/${dark ? "dark" : "light"}-${side === "왼쪽" ? "left" : "right"}.png`,
				animations: "disabled",
			});
		}
	}

	// Persistence: last combo is dark-right; set light-left, reload.
	await page.getByRole("row", { name: "라이트", exact: true }).click();
	await page.getByRole("row", { name: "왼쪽", exact: true }).click();
	await page.reload();
	await expect(nav).toBeVisible({ timeout: 20000 });
	await expect(html).not.toHaveClass(/dark/);
	const p = await xs();
	expect(p.rail).toBeLessThan(p.panel);
	await openSettings();
	await expect(page.getByRole("row", { name: "라이트", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(page.getByRole("row", { name: "왼쪽", exact: true })).toHaveAttribute("aria-selected", "true");
});
