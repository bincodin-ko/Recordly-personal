// Screen Studio-style recording helpers: resize the target window to an exact size,
// hide desktop icons while recording, and the quick export widget shown after recording.
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import { USER_DATA_PATH } from "./appPaths";
import { readAppSetting } from "./appSettingsStore";
import { createDesktopIconsController, type DesktopIconsMode } from "./desktopIconsController";
import { selectedSource } from "./ipc/state";
import { parseWindowId } from "./ipc/utils";
import { createQuickExportWidgetWindow } from "./windows";

const execFileAsync = promisify(execFile);

// Keys shared with src/components/launch/popovers/RecordingSettingsPopover.tsx.
export const HIDE_DESKTOP_ICONS_SETTING_KEY = "recordly.recording.hideDesktopIcons";
export const QUICK_EXPORT_WIDGET_SETTING_KEY = "recordly.recording.showQuickExportWidget";

function powershellArgs(script: string) {
	return ["-NoProfile", "-NonInteractive", "-Command", script];
}

// ---------------------------------------------------------------------------
// Resize the selected window (Windows)
// ---------------------------------------------------------------------------

// Sizes are the visible window frame in physical pixels (= the recorded size).
// The window is centred on its monitor's work area so it stays fully visible.
const RESIZE_WINDOW_SCRIPT = [
	'Add-Type -TypeDefinition @"',
	"using System; using System.Runtime.InteropServices;",
	"public static class RecordlyWindowResize {",
	"  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }",
	"  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }",
	'  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);',
	'  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);',
	'  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
	'  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);',
	'  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
	'  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);',
	'  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);',
	'  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);',
	'  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);',
	"  public static RECT Frame(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(h, out r); return r; }",
	"  public static string Resize(IntPtr h, int w, int hh) {",
	"    SetThreadDpiAwarenessContext(new IntPtr(-4));",
	"    if (IsZoomed(h) || IsIconic(h)) { ShowWindow(h, 9); System.Threading.Thread.Sleep(150); }",
	"    RECT outer; GetWindowRect(h, out outer); RECT frame = Frame(h);",
	"    int padW = (outer.Right - outer.Left) - (frame.Right - frame.Left);",
	"    int padH = (outer.Bottom - outer.Top) - (frame.Bottom - frame.Top);",
	"    MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));",
	"    GetMonitorInfo(MonitorFromWindow(h, 2), ref mi);",
	"    int x = Math.Max(mi.rcWork.Left, mi.rcWork.Left + (mi.rcWork.Right - mi.rcWork.Left - w) / 2) - (frame.Left - outer.Left);",
	"    int y = Math.Max(mi.rcWork.Top, mi.rcWork.Top + (mi.rcWork.Bottom - mi.rcWork.Top - hh) / 2) - (frame.Top - outer.Top);",
	"    SetWindowPos(h, IntPtr.Zero, x, y, w + padW, hh + padH, 0x0004 | 0x0010);",
	"    System.Threading.Thread.Sleep(100);",
	'    RECT after = Frame(h); return (after.Right - after.Left) + "x" + (after.Bottom - after.Top);',
	"  }",
	"}",
	'"@',
	"[RecordlyWindowResize]::Resize([IntPtr][Int64]$env:RECORDLY_WINDOW_ID, [int]$env:RECORDLY_WIDTH, [int]$env:RECORDLY_HEIGHT)",
].join("\n");

export async function resizeWindowsWindow(windowId: number, width: number, height: number) {
	const { stdout } = await execFileAsync("powershell.exe", powershellArgs(RESIZE_WINDOW_SCRIPT), {
		timeout: 10000,
		env: {
			...process.env,
			RECORDLY_WINDOW_ID: String(windowId),
			RECORDLY_WIDTH: String(Math.round(width)),
			RECORDLY_HEIGHT: String(Math.round(height)),
		},
	});
	const match = stdout.trim().match(/^(\d+)x(\d+)$/);
	return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

// ---------------------------------------------------------------------------
// Hide desktop icons while recording (Windows)
// ---------------------------------------------------------------------------

// Hides only the desktop icon list window (SysListView32). Nothing persistent is
// changed, so restarting Explorer also brings the icons back.
// Prints the icon list state after the action: "visible" | "hidden" | "missing"
// ("already-hidden" when asked to hide icons the user had already hidden).
const DESKTOP_ICONS_SCRIPT = [
	'Add-Type -TypeDefinition @"',
	"using System; using System.Runtime.InteropServices;",
	"public static class RecordlyDesktopIcons {",
	'  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string w);',
	'  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);',
	'  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
	"  public static IntPtr ListView() {",
	'    IntPtr view = FindWindowEx(FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);',
	"    IntPtr worker = IntPtr.Zero;",
	'    while (view == IntPtr.Zero && (worker = FindWindowEx(IntPtr.Zero, worker, "WorkerW", null)) != IntPtr.Zero)',
	'      view = FindWindowEx(worker, IntPtr.Zero, "SHELLDLL_DefView", null);',
	'    return view == IntPtr.Zero ? IntPtr.Zero : FindWindowEx(view, IntPtr.Zero, "SysListView32", null);',
	"  }",
	"}",
	'"@',
	"$list = [RecordlyDesktopIcons]::ListView()",
	"if ($list -eq [IntPtr]::Zero) { 'missing'; exit }",
	"if ($env:RECORDLY_DESKTOP_ICONS -eq 'hide') { if (-not [RecordlyDesktopIcons]::IsWindowVisible($list)) { 'already-hidden'; exit }; [RecordlyDesktopIcons]::ShowWindow($list, 0) | Out-Null }",
	"if ($env:RECORDLY_DESKTOP_ICONS -eq 'show') { [RecordlyDesktopIcons]::ShowWindow($list, 5) | Out-Null }",
	"if ([RecordlyDesktopIcons]::IsWindowVisible($list)) { 'visible' } else { 'hidden' }",
].join("\n");

function desktopIconsEnv(mode: DesktopIconsMode) {
	return { ...process.env, RECORDLY_DESKTOP_ICONS: mode };
}

export async function runDesktopIconsScript(mode: DesktopIconsMode): Promise<string> {
	const { stdout } = await execFileAsync("powershell.exe", powershellArgs(DESKTOP_ICONS_SCRIPT), {
		timeout: 10000,
		env: desktopIconsEnv(mode),
	});
	return stdout.trim();
}

function runDesktopIconsScriptSync(mode: DesktopIconsMode): string {
	return execFileSync("powershell.exe", powershellArgs(DESKTOP_ICONS_SCRIPT), {
		timeout: 10000,
		env: desktopIconsEnv(mode),
		encoding: "utf-8",
	}).trim();
}

const DESKTOP_ICONS_MARKER = path.join(USER_DATA_PATH, "desktop-icons-hidden.flag");
const desktopIcons = createDesktopIconsController({
	run: runDesktopIconsScript,
	runSync: runDesktopIconsScriptSync,
	marker: {
		set: () => fs.writeFileSync(DESKTOP_ICONS_MARKER, String(Date.now())),
		clear: () => fs.rmSync(DESKTOP_ICONS_MARKER, { force: true }),
		exists: () => fs.existsSync(DESKTOP_ICONS_MARKER),
	},
});
let recordingActive = false;

/** Called from main's recording-state callback. */
export function onCaptureExtrasRecordingState(recording: boolean) {
	recordingActive = recording;
	if (!recording && process.platform === "win32") void desktopIcons.restore();
}

export function restoreDesktopIconsSync() {
	if (process.platform === "win32") desktopIcons.restoreSync();
}

// ---------------------------------------------------------------------------
// Quick export widget
// ---------------------------------------------------------------------------

let quickExportWidget: BrowserWindow | null = null;
let quickExportVideoPath: string | null = null;

function closeQuickExportWidget() {
	if (quickExportWidget && !quickExportWidget.isDestroyed()) quickExportWidget.close();
	quickExportWidget = null;
}

async function copyFileToClipboard(filePath: string) {
	if (process.platform !== "win32") {
		clipboard.writeText(filePath);
		return;
	}
	// CF_HDROP file list: pastes as a file into Explorer, Slack, Discord, mail, …
	await execFileAsync(
		"powershell.exe",
		powershellArgs("Set-Clipboard -LiteralPath $env:RECORDLY_CLIPBOARD_FILE"),
		{ timeout: 10000, env: { ...process.env, RECORDLY_CLIPBOARD_FILE: filePath } },
	);
}

export function registerCaptureExtrasHandlers() {
	// A crash or kill during a recording left the icons hidden: bring them back.
	restoreDesktopIconsSync();

	ipcMain.handle("resize-selected-window", async (_, width: number, height: number) => {
		const windowId = parseWindowId(selectedSource?.id);
		if (process.platform !== "win32" || !windowId) return { success: false };
		try {
			const size = await resizeWindowsWindow(windowId, width, height);
			return size ? { success: true, ...size } : { success: false };
		} catch (error) {
			console.warn("Failed to resize window:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("desktop-icons-before-recording", async () => {
		if (process.platform !== "win32" || readAppSetting(HIDE_DESKTOP_ICONS_SETTING_KEY) !== true)
			return;
		await desktopIcons.hide();
	});
	// Recording start finished (or failed / was cancelled): restore if nothing is recording.
	ipcMain.handle("desktop-icons-after-startup", async () => {
		if (!recordingActive && process.platform === "win32") await desktopIcons.restore();
	});

	ipcMain.handle("show-quick-export-widget", (_, videoPath: string) => {
		if (readAppSetting(QUICK_EXPORT_WIDGET_SETTING_KEY) === false) return false;
		if (typeof videoPath !== "string" || !fs.existsSync(videoPath)) return false;
		closeQuickExportWidget();
		quickExportVideoPath = videoPath;
		const widget = createQuickExportWidgetWindow();
		quickExportWidget = widget;
		widget.on("closed", () => {
			if (quickExportWidget === widget) quickExportWidget = null;
		});
		return true;
	});
	ipcMain.handle("quick-export-get-video", () => quickExportVideoPath);
	ipcMain.handle("quick-export-close", () => closeQuickExportWidget());
	ipcMain.handle("quick-export-save", async (event) => {
		if (!quickExportVideoPath) return { success: false };
		const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
		const extension = path.extname(quickExportVideoPath) || ".mp4";
		const options = {
			defaultPath: path.join(app.getPath("downloads"), path.basename(quickExportVideoPath)),
			filters: [{ name: "Video", extensions: [extension.slice(1)] }],
		};
		const result = owner
			? await dialog.showSaveDialog(owner, options)
			: await dialog.showSaveDialog(options);
		if (result.canceled || !result.filePath) return { success: false, canceled: true };
		await fs.promises.copyFile(quickExportVideoPath, result.filePath);
		return { success: true, path: result.filePath };
	});
	ipcMain.handle("quick-export-copy", async () => {
		if (!quickExportVideoPath) return { success: false };
		try {
			await copyFileToClipboard(quickExportVideoPath);
			return { success: true };
		} catch (error) {
			console.warn("Failed to copy recording to clipboard:", error);
			return { success: false, error: String(error) };
		}
	});
}
