import { test } from "@playwright/test";
import fs from "node:fs";
import { installDesktopBridge } from "./bridge";
test("probe", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Rename project" }).click({ timeout: 30000 });
	await page.getByRole("textbox", { name: "Project name" }).fill("A very long project title that should truncate and never cover the toolbar");
	const out: string[] = [];
	for (const width of [1440, 1280, 800]) {
		await page.setViewportSize({ width, height: 800 });
		await page.waitForTimeout(300);
		const b = await Promise.all([".editor-header-start", ".editor-header-title", ".editor-header-end"].map((s) => page.locator(s).boundingBox()));
		out.push(`${width}: ${b.map((x) => `${Math.round(x!.x)}-${Math.round(x!.x + x!.width)}`).join(" | ")}`);
		await page.screenshot({ path: `.verify/probe-header-${width}.png`, clip: { x: 0, y: 0, width, height: 60 } });
	}
	fs.writeFileSync(".verify/probe.json", out.join("\n"));
});
