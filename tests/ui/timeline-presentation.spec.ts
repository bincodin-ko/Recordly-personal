import { expect, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

test("editor uses skeletons until media opens", async ({ page }) => {
	test.setTimeout(120000);
	let release!: () => void;
	let releaseMedia!: () => void;
	const mediaPending = new Promise<void>((resolve) => {
		releaseMedia = resolve;
	});
	await page.route("**/tests/ui/fixtures/preview.mp4", async (route) => {
		await mediaPending;
		await route.continue();
	});
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.exposeFunction("waitForTestMedia", () => pending);
	await installDesktopBridge(page);
	await installDesktopBridgeOverrides(page, () => {
		window.electronAPI.getCurrentVideoPath = async () => {
			await (
				window as unknown as { waitForTestMedia: () => Promise<void> }
			).waitForTestMedia();
			return { success: true, path: `${location.origin}/tests/ui/fixtures/preview.mp4` };
		};
	});
	await page.goto("/?windowType=editor");
	const loading = page.getByRole("status", { name: "Loading editor" });
	await expect(loading).toBeVisible({ timeout: 45000 });
	await expect(loading.locator(".skeleton").first()).toBeVisible();
	await page.screenshot({ path: "test-results/editor-skeleton.png", animations: "disabled" });
	release();
	// The editor skeleton now stays until the media itself opens (no separate "Loading preview" stage
	// is guaranteed to be visible in between).
	await page.waitForTimeout(500);
	await expect(loading).toHaveCount(1);
	releaseMedia();
	await expect(loading).toHaveCount(0, { timeout: 45000 });
	await expect(page.getByLabel("Loading preview", { exact: true })).toHaveCount(0, {
		timeout: 45000,
	});
	await expect(page.locator('[data-variant="clip"]')).toBeVisible();
});

test("filmstrips have persistent handles, conditional speed badges and centered navigation", async ({
	page,
}) => {
	test.setTimeout(90000);
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	const clip = page.locator('[data-timeline-item][data-variant="clip"]');
	await expect(clip).toBeVisible({ timeout: 45000 });
	// The band now shows a compact label (duration and speed) instead of an empty filmstrip.
	await expect(clip).toHaveText(/Clip\s*6s · 1×/);
	await page.mouse.move(1000, 300);
	for (const side of ["left", "right"]) {
		await expect(clip.getByTitle(`Resize ${side}`)).toHaveCSS("opacity", "1");
		await expect(clip.getByTitle(`Resize ${side}`)).toHaveCSS(
			"background-color",
			"rgba(255, 255, 255, 0.88)", // light grips on the ochre band
		);
	}
	await page.getByRole("button", { name: "Add Zoom (Z)", exact: true }).click();
	const zoom = page.locator('[data-variant="zoom"] .timeline-block');
	await expect(zoom).toBeVisible();
	const clipHeight = (await clip.locator(".timeline-block").boundingBox())!.height;
	const zoomHeight = (await zoom.boundingBox())!.height;
	expect(Math.abs(clipHeight - zoomHeight)).toBeLessThan(1);
	const colors = await zoom.evaluate((node) => {
		const probe = document.createElement("span");
		probe.style.background = "var(--accent)";
		document.body.append(probe);
		const accent = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return [getComputedStyle(node).backgroundColor, accent];
	});
	// Zoom blocks use the purple timeline palette (c88f573f), not the generic accent.
	expect(colors[0]).not.toBe("rgba(0, 0, 0, 0)");
	for (const width of [1440, 1250, 800]) {
		await page.setViewportSize({ width, height: 800 });
		await expect(clip).toBeVisible({ timeout: 45000 });
		await page.evaluate(
			(dark) => document.documentElement.classList.toggle("dark", dark),
			width === 1250,
		);
		// The tool rail now sits on the right beside the settings panel (2e876b0b); its controls
		// must stay centered within the rail.
		const nav = page.getByRole("navigation", { name: "Editor tools" });
		const rail = (await nav.boundingBox())!;
		for (const control of await nav.locator('button, [role="radio"]').all()) {
			const box = (await control.boundingBox())!;
			expect(Math.abs(box.x + box.width / 2 - (rail.x + rail.width / 2))).toBeLessThan(1);
		}
		await page.screenshot({
			path: `test-results/clip-rail-${width}.png`,
			animations: "disabled",
		});
	}
	await clip.click();
	const speed = page.getByRole("slider", { name: "Speed", exact: true });
	await speed.focus();
	await page.keyboard.press("ArrowRight");
	await expect(clip).toHaveText(/1\.25\s*[x×]/);
	await page.keyboard.press("ArrowLeft");
	await expect(clip).toHaveText(/·\s*1×/);
});
