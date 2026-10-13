// B1 audible scrubbing, B2 J/K/L, B3 playhead memory + auto "마이크 음소거" (renderer-only).
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge, installDesktopBridgeOverrides } from "./bridge";

const screensDir = process.env.VERIFY_SCREENS_DIR ?? path.join(".verify", "screens");

type Grain = { sourceSeconds: number; rate: number };

/** 16 kHz mono 16-bit WAV: `seconds` of a 220 Hz tone at `amplitude` (0 = silence). */
function wav(seconds: number, amplitude: number) {
	const rate = 16000;
	const samples = Math.round(seconds * rate);
	const buffer = Buffer.alloc(44 + samples * 2);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + samples * 2, 4);
	buffer.write("WAVEfmt ", 8);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(rate, 24);
	buffer.writeUInt32LE(rate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(samples * 2, 40);
	for (let i = 0; i < samples; i++) {
		buffer.writeInt16LE(Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + i * 2);
	}
	return buffer;
}

async function openEditor(page: Page, options: { micAmplitude?: number } = {}) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem("recordly.locale", "ko");
		} catch {
			// storage unavailable
		}
		(window as unknown as { __recordlyScrubGrains: Grain[] }).__recordlyScrubGrains = [];
	});
	await installDesktopBridge(page, "filmstrip.mp4");
	if (options.micAmplitude !== undefined) {
		await page.route("**/tests/ui/fixtures/take.mic.wav", (route) =>
			route.fulfill({ contentType: "audio/wav", body: wav(3, options.micAmplitude ?? 0) }),
		);
		// A fresh recording session with a separate microphone track.
		await installDesktopBridgeOverrides(page, () => {
			const api = window.electronAPI as unknown as Record<string, unknown>;
			const video = `${location.origin}/tests/ui/fixtures/filmstrip.mp4`;
			api.getCurrentRecordingSession = async () => ({
				success: true,
				session: { videoPath: video, webcamPath: null },
			});
			api.getVideoAudioFallbackPaths = async () => ({
				success: true,
				paths: [`${location.origin}/tests/ui/fixtures/take.mic.wav`],
			});
		});
	}
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
		timeout: 60000,
	});
	await expect
		.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 45000 })
		.toBeGreaterThanOrEqual(2);
}

const video = (page: Page) => page.locator('video[aria-hidden="true"]').first();
const videoTime = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
const grains = (page: Page) =>
	page.evaluate(() => (window as unknown as { __recordlyScrubGrains: Grain[] }).__recordlyScrubGrains);
const clearGrains = (page: Page) =>
	page.evaluate(() => {
		(window as unknown as { __recordlyScrubGrains: Grain[] }).__recordlyScrubGrains.length = 0;
	});

async function shot(page: Page, name: string) {
	const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
	await page.waitForTimeout(400);
	await page.screenshot({
		path: path.join(screensDir, `${name}-${width}x${height}.png`),
		animations: "disabled",
	});
}

test.describe("s10-b playback", () => {
	test.setTimeout(150000);

	test("B1 dragging the playhead plays audio at drag speed, forward and backward", async ({ page }) => {
		await openEditor(page);
		const clip = (await page.locator('[data-variant="clip"]').first().boundingBox())!;
		const y = clip.y - 12; // ruler / empty strip above the clip
		await page.mouse.move(clip.x + 20, y);
		await page.mouse.down();
		await page.mouse.move(clip.x + clip.width * 0.7, y, { steps: 25 });
		await page.mouse.move(clip.x + clip.width * 0.2, y, { steps: 25 });
		await shot(page, "s10b-b1-scrubbing");
		await page.mouse.up();
		const recorded = await grains(page);
		expect(recorded.some((g) => g.rate > 0)).toBe(true);
		expect(recorded.some((g) => g.rate < 0)).toBe(true);
		// Faster drag = faster audio: rates are not all identical.
		expect(new Set(recorded.map((g) => Math.round(Math.abs(g.rate) * 10))).size).toBeGreaterThan(1);
	});

	test("B2 J/K/L: L plays, repeated L speeds up, J reverses, K pauses, ignored while typing", async ({
		page,
	}) => {
		await openEditor(page);
		const pause = page.getByRole("button", { name: "일시정지", exact: true }).first();
		await page.locator("body").press("l");
		await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
		await page.locator("body").press("k");
		await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
		await expect(pause).toHaveCount(0);

		await clearGrains(page);
		await page.keyboard.press("l");
		await page.keyboard.press("l"); // 2x: stepped by the J/K/L loop with audible grains
		await page.waitForTimeout(500);
		expect((await grains(page)).some((g) => g.rate === 2)).toBe(true);
		await page.keyboard.press("l"); // 4x
		await page.waitForTimeout(300);
		expect((await grains(page)).some((g) => g.rate === 4)).toBe(true);
		await page.keyboard.press("k");
		const stopped = await videoTime(page);

		await clearGrains(page);
		await page.keyboard.press("j");
		await page.waitForTimeout(500);
		expect((await grains(page)).some((g) => g.rate === -1)).toBe(true);
		await page.keyboard.press("k");
		expect(await videoTime(page)).toBeLessThan(stopped);

		// Typing in a text field never triggers J/K/L.
		const before = await videoTime(page);
		await page.evaluate(() => {
			const input = document.createElement("input");
			input.id = "typing-probe";
			document.body.appendChild(input);
		});
		await page.locator("#typing-probe").focus();
		await page.keyboard.type("lll");
		await page.waitForTimeout(300);
		expect(await videoTime(page)).toBe(before);
		expect(await video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
		await page.locator("#typing-probe").evaluate((el) => el.remove());
	});

	test("B2 J/K/L appear in the shortcut list", async ({ page }) => {
		await openEditor(page);
		await page.getByRole("radio", { name: "설정", exact: true }).click();
		await page.getByRole("button", { name: "변경", exact: true }).first().click();
		await expect(page.getByText("역방향 재생 (반복하면 2배, 4배)").first()).toBeVisible();
		await expect(page.getByText("정방향 재생 (반복하면 2배, 4배)").first()).toBeVisible();
		await shot(page, "s10b-b2-shortcut-list");
	});

	test("B3a project reopens at the saved playhead", async ({ page }) => {
		await openEditor(page);
		const clip = (await page.locator('[data-variant="clip"]').first().boundingBox())!;
		await page.mouse.click(clip.x + clip.width * 0.6, clip.y - 12);
		await expect.poll(() => videoTime(page)).toBeGreaterThan(2);
		const saved = await videoTime(page);
		await page.waitForTimeout(800); // debounce write
		await page.reload();
		await expect(page.locator('[data-variant="clip"]')).toHaveAttribute("data-end-ms", "6000", {
			timeout: 60000,
		});
		await expect.poll(() => videoTime(page), { timeout: 20000 }).toBeGreaterThan(saved - 0.2);
		expect(await videoTime(page)).toBeLessThan(saved + 0.2);
		await shot(page, "s10b-b3-reopened-playhead");
	});

	for (const [name, amplitude, muted] of [
		["silent", 0.0005, true],
		["speech", 0.3, false],
	] as const) {
		test(`B3b new recording with ${name} mic opens with mute ${muted ? "on" : "off"}`, async ({
			page,
		}) => {
			await openEditor(page, { micAmplitude: amplitude });
			const toggle = page.getByRole("switch", { name: "마이크 음소거", exact: true });
			await page.getByRole("radio", { name: "오디오", exact: true }).click();
			await toggle.scrollIntoViewIfNeeded();
			if (muted) await expect(toggle).toBeChecked({ timeout: 20000 });
			else {
				await page.waitForTimeout(3000); // give detection time to (wrongly) flip it
				await expect(toggle).not.toBeChecked();
			}
			if (muted) await shot(page, "s10b-b3-auto-mute-mic");
		});
	}
});
