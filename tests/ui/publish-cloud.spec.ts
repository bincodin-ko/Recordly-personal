import { expect, test } from "@playwright/test";

// Fixture pages skip the desktop bridge, so pin the English locale here (the app defaults to Korean).
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem("recordly.locale", "en"));
});

test("shared cards open ready links and delete incomplete uploads", async ({ page }) => {
	await page.goto("/tests/ui/shared-recordings.html");
	await page.getByRole("button", { name: "Product walkthrough", exact: true }).click();
	await expect(page.getByRole("status")).toHaveText("Opened https://example.test/s/demo1");
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toBeDisabled();
	await page
		.getByRole("button", { name: "Options for An interrupted upload", exact: true })
		.click();
	page.once("dialog", (dialog) => dialog.dismiss());
	await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toHaveCount(1);
	await page
		.getByRole("button", { name: "Options for An interrupted upload", exact: true })
		.click();
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toHaveCount(0);
	await page.getByRole("textbox", { name: "Search projects" }).fill("missing");
	await expect(page.getByText("No matching projects", { exact: true })).toBeVisible();
});

test("deleting from another shared library refreshes a mounted Share quota", async ({ page }) => {
	await page.goto("/tests/ui/shared-recordings.html?capacity");
	await expect(page.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
	await page
		.getByRole("button", { name: "Options for An interrupted upload", exact: true })
		.click();
	page.once("dialog", (dialog) => dialog.dismiss());
	await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
	await expect(page.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
	await page
		.getByRole("button", { name: "Options for An interrupted upload", exact: true })
		.click();
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "An interrupted upload", exact: true }),
	).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Share", exact: true })).toBeEnabled();
	await expect(
		page.getByText(
			"You have 5 cloud recordings. Delete one from Shared before sharing another.",
		),
	).toHaveCount(0);
});

// Cloud "Link" publishing is off in the personal build (LOCAL_EXPORT_ONLY in EditorExportMenu.tsx,
// 99eaa139 "offline UI fixes"); the header button is now "Export" and only has the local flow.
test("Export menu preserves manual export reporting", async ({ page }) => {
	await page.goto("/tests/ui/publish.html?export-error");
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await page.getByRole("button", { name: "Report error", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Report export error", exact: true });
	await expect(dialog).toBeVisible();
	await dialog.getByText("View data to be sent", { exact: true }).click();
	await expect(dialog.locator("pre")).toContainText("VIDEO_DECODE_ENCODING_ERROR");
});
