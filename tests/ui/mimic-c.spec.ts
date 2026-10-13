// Mimic C: C1 cutout camera layout, C2 reel overlay choice, C3 preset files (renderer only, Korean UI).
import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const screensDir = process.env.VERIFY_SCREENS_DIR ?? path.join(".verify", "screens");

async function openEditor(page: Page, withWebcam = false) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem("recordly.locale", "ko");
		} catch {
			// storage unavailable
		}
	});
	await installDesktopBridge(page, "filmstrip.mp4");
	if (withWebcam) {
		await page.addInitScript(() => {
			const api = (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI;
			api.getCurrentRecordingSession = async () => ({
				success: true,
				session: {
					videoPath: `${location.origin}/tests/ui/fixtures/filmstrip.mp4`,
					webcamPath: `${location.origin}/tests/ui/fixtures/preview.mp4`,
				},
			});
		});
	}
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 60000,
	});
}

async function shot(page: Page, name: string) {
	await page.waitForTimeout(500);
	await page.screenshot({ path: path.join(screensDir, `${name}.png`), animations: "disabled" });
}

test.describe.configure({ timeout: 120000 });

test("C1 cutout layout: camera has no box, stands bottom-right, background removal switched on", async ({ page }) => {
	await openEditor(page, true);
	const hint = page.getByText("눌러서 카메라 레이아웃 추가");
	await hint.scrollIntoViewIfNeeded();
	const box = (await hint.boundingBox())!;
	await page.mouse.click(30, box.y + box.height / 2);
	const menu = page.getByTestId("camera-layout-menu");
	await expect(menu.getByRole("menuitemradio", { name: "컷아웃" })).toBeVisible();
	await shot(page, "mimic-c1-layout-menu");
	await menu.getByRole("menuitemradio", { name: "컷아웃" }).click();
	const block = page.getByTestId("timeline-camera-layout-block");
	await expect(block).toContainText("컷아웃");
	// Seek into the block so the layout transition has finished.
	const clipBox = (await page.locator('[data-variant="clip"]').boundingBox())!;
	await page.mouse.click(clipBox.x + 150, clipBox.y - 20);
	await page.waitForTimeout(1200);
	await page.getByRole("radio", { name: "카메라", exact: true }).click();
	await expect(page.getByRole("switch", { name: /배경 지우기/ })).toBeChecked();
	await shot(page, "mimic-c1-cutout-block");
});

test("C2 reel mode offers 끔 / 인스타그램 / 틱톡, draws a different overlay each, persists", async ({ page }) => {
	await openEditor(page);
	const button = page.getByTestId("reel-mode-button");
	await button.click();
	for (const label of ["끔", "인스타그램", "틱톡"]) {
		await expect(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
	}
	await shot(page, "mimic-c2-reel-menu");
	await page.getByRole("menuitem", { name: "인스타그램", exact: true }).click();
	const overlay = page.getByTestId("reel-mode-overlay");
	await expect(overlay).toHaveAttribute("data-kind", "instagram");
	await shot(page, "mimic-c2-reel-instagram");
	await button.click();
	await page.getByRole("menuitem", { name: "틱톡", exact: true }).click();
	await expect(overlay).toHaveAttribute("data-kind", "tiktok");
	await expect(overlay).toContainText("For You");
	await shot(page, "mimic-c2-reel-tiktok");
	expect(await page.evaluate(() => localStorage.getItem("recordly.reelOverlay"))).toBe("tiktok");
	await page.reload();
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", { timeout: 60000 });
	await expect(page.getByTestId("reel-mode-button")).toContainText("틱톡");
	await page.getByTestId("reel-mode-button").click();
	await page.getByRole("menuitem", { name: "끔", exact: true }).click();
	await expect(overlay).toHaveCount(0);
});

test("C3 preset menu exports a .recordly-preset file and imports it back; invalid file shows a Korean error", async ({ page }, testInfo) => {
	await openEditor(page);
	await page.getByRole("button", { name: "프리셋 열기" }).click();
	await expect(page.getByTestId("preset-export-file")).toHaveText("파일로 내보내기…");
	await expect(page.getByTestId("preset-import-file")).toHaveText("파일 가져오기…");
	await page.getByPlaceholder("프리셋 이름").fill("시험 프리셋");
	await page.getByRole("button", { name: "저장", exact: true }).click();
	const downloadPromise = page.waitForEvent("download");
	await page.getByTestId("preset-export-file").click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe("시험 프리셋.recordly-preset");
	const file = testInfo.outputPath("exported.recordly-preset");
	await download.saveAs(file);
	const json = JSON.parse(fs.readFileSync(file, "utf8"));
	expect(json).toMatchObject({ format: "recordly-preset", version: 1, name: "시험 프리셋" });
	// import the same file: added under a de-duplicated name
	await page.getByTestId("preset-import-input").setInputFiles(file);
	await expect(page.getByText("시험 프리셋 (2)").first()).toBeVisible();
	await shot(page, "mimic-c3-preset-imported");
	// invalid file
	const bad = testInfo.outputPath("bad.recordly-preset");
	fs.writeFileSync(bad, '{"hello": 1}');
	await page.getByTestId("preset-import-input").setInputFiles(bad);
	await expect(page.getByText("프리셋 파일을 읽지 못했어요", { exact: false })).toBeVisible();
	await shot(page, "mimic-c3-preset-invalid");
});
