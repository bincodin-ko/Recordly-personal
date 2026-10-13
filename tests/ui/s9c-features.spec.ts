// C1 design fixes, C2 caption model/prompt controls, C3 raw-file extraction (renderer-only).
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

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
	await installDesktopBridgeOverrides(page, () => {
		const api = window.electronAPI as unknown as Record<string, unknown>;
		const calls: string[] = [];
		(window as unknown as { __calls: string[] }).__calls = calls;
		api.getWhisperSmallModelStatus = async (model?: string) => {
			calls.push(`status:${model}`);
			return { success: true, exists: model === "small", path: model === "small" ? "/m/ggml-small.bin" : null };
		};
		api.downloadWhisperSmallModel = async (model?: string) => {
			calls.push(`download:${model}`);
			return { success: true, path: `/m/ggml-${model}.bin` };
		};
		api.extractRawRecordingFiles = async (source: string) => {
			calls.push(`extract:${source.split("/").pop()}`);
			return {
				success: true,
				folder: "/out",
				files: [
					{ kind: "screen", path: "/out/a.mp4" },
					{ kind: "microphone", path: "/out/a.mic.wav" },
				],
			};
		};
		api.revealInFolder = async (target: string) => {
			calls.push(`reveal:${target}`);
			return { success: true };
		};
	});
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 60000,
	});
}

/** The mock editor has no local source path; give extraction one once the editor has loaded. */
const setRecordingSession = (page: Page) =>
	page.evaluate(() => {
		(window.electronAPI as unknown as Record<string, unknown>).getCurrentRecordingSession = async () => ({
			success: true,
			session: { videoPath: "/rec/filmstrip.mp4", webcamPath: null },
		});
	});

const calls = (page: Page) =>
	page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);

async function shot(page: Page, name: string) {
	const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
	await page.waitForTimeout(400);
	await page.screenshot({
		path: path.join(screensDir, `${name}-${width}x${height}.png`),
		animations: "disabled",
	});
}

/** Last control of the active settings tab is fully inside the scroller after scrolling down. */
async function expectLastControlReachable(page: Page, tab: string) {
	await page.getByRole("radio", { name: tab, exact: true }).click();
	const scroller = page.getByTestId("settings-scroll");
	await page.waitForTimeout(800); // tab enter animation changes the content height
	await scroller.evaluate((el) => {
		el.scrollTop = el.scrollHeight;
	});
	await page.waitForTimeout(400);
	const gap = await scroller.evaluate((el) => {
		const box = el.getBoundingClientRect();
		const last = [...el.querySelectorAll<HTMLElement>("*")]
			.filter((node) => node.getBoundingClientRect().height > 0)
			.reduce((max, node) => Math.max(max, node.getBoundingClientRect().bottom), 0);
		return box.bottom - last;
	});
	expect(gap).toBeGreaterThanOrEqual(16); // clear of the 20px fade zone
	await shot(page, `s9c-${tab}-scrolled-bottom`);
}

test.describe("C1 design fixes", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("zoom tab breaks Korean between words", async ({ page }) => {
		await openEditor(page);
		await page.getByRole("radio", { name: "줌", exact: true }).click();
		expect(await page.evaluate(() => getComputedStyle(document.body).wordBreak)).toBe("keep-all");
		await shot(page, "s9c-줌");
	});

	test("camera and captions tabs scroll fully", async ({ page }) => {
		await openEditor(page);
		await expectLastControlReachable(page, "카메라");
		await expectLastControlReachable(page, "자막");
	});

	test("command menu input has no clipped focus ring and rows are not cut", async ({ page }) => {
		await openEditor(page);
		await page.locator("body").click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Meta+k");
		const dialog = page.getByTestId("command-menu");
		await expect(dialog).toBeVisible();
		const input = dialog.getByRole("textbox");
		await expect(input).toBeFocused();
		expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
		const list = dialog.getByRole("listbox");
		expect(await list.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(300);
		await shot(page, "s9c-command-menu");
	});
});

test.describe("C2 caption model and frequent words", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("model choice defaults to small, persists in settings, prompt is editable", async ({ page }) => {
		await openEditor(page);
		await page.getByRole("radio", { name: "자막", exact: true }).click();
		const select = page.getByTestId("caption-model-select");
		await expect(select).toContainText("보통 (Small)");
		await expect(page.getByRole("button", { name: "모델 삭제" })).toBeVisible();
		await select.click();
		await page.getByRole("option", { name: "정확 (Medium)" }).click();
		await expect(select).toContainText("정확 (Medium)");
		await expect.poll(() => calls(page)).toContain("status:medium");
		const download = page.getByRole("button", { name: /모델 다운로드/ });
		await expect(download).toContainText("1.5 GB");
		await download.click();
		await expect.poll(() => calls(page)).toContain("download:medium");
		const prompt = page.getByTestId("caption-prompt-input");
		await prompt.fill("Recordly, 쿠버네티스");
		await expect(prompt).toHaveValue("Recordly, 쿠버네티스");
		await page.getByTestId("settings-scroll").evaluate((el) => {
			el.scrollTop = 0;
		});
		await shot(page, "s9c-자막-model-prompt");
	});
});

test.describe("C3 raw files", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("더보기 menu extracts raw files and toast opens the folder", async ({ page }) => {
		await openEditor(page);
		await setRecordingSession(page);
		await page.getByTestId("editor-more-menu").click();
		await shot(page, "s9c-more-menu");
		await page.getByRole("menuitem", { name: "원본 파일 꺼내기…" }).click();
		await expect(page.getByText("원본 파일 2개를 꺼냈어요")).toBeVisible();
		expect((await calls(page)).some((c) => c.startsWith("extract:filmstrip.mp4"))).toBe(true);
		await shot(page, "s9c-raw-toast");
		await page.getByRole("button", { name: "폴더 열기" }).click();
		await expect.poll(() => calls(page)).toContain("reveal:/out/a.mp4");
	});

	test("Ctrl+K command runs the same action", async ({ page }) => {
		await openEditor(page);
		await page.locator("body").click({ position: { x: 5, y: 5 } });
		await setRecordingSession(page);
		await page.keyboard.press("Meta+k");
		await page.getByTestId("command-menu").getByRole("textbox").fill("원본");
		await page.keyboard.press("Enter");
		await expect.poll(async () => (await calls(page)).some((c) => c.startsWith("extract:"))).toBe(true);
	});
});
