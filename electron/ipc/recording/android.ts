// Android screen recording over USB via the bundled scrcpy (Apache-2.0).
// scrcpy records to MKV (survives being terminated); on stop we remux to MP4 for the editor.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";

const execFileAsync = promisify(execFile);
const SCRCPY_DIR_NAME = "scrcpy-win64-v5.0";

export type AndroidDevice = { serial: string; model: string };

let scrcpyProcess: ChildProcess | null = null;
let recordingMkvPath: string | null = null;
let recordingMp4Path: string | null = null;

export function isAndroidRecordingActive() {
	return scrcpyProcess !== null;
}

async function resolveScrcpyDir(): Promise<string | null> {
	const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
	const candidates = [
		resourcesPath &&
			path.join(resourcesPath, "app.asar.unpacked", "electron", "native", "third_party", SCRCPY_DIR_NAME),
		path.join(app.getAppPath(), "electron", "native", "third_party", SCRCPY_DIR_NAME),
		path.join(process.cwd(), "electron", "native", "third_party", SCRCPY_DIR_NAME),
	].filter(Boolean) as string[];
	for (const dir of candidates) {
		try {
			await fs.access(path.join(dir, "scrcpy.exe"));
			return dir;
		} catch {
			// try next
		}
	}
	return null;
}

/** `adb devices -l` lines like: "R5CW1234ABC device usb:1-1 product:x model:SM_S918N device:y" */
export function parseAdbDevices(output: string): AndroidDevice[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /\sdevice(\s|$)/.test(line) && !line.startsWith("List of"))
		.map((line) => {
			const serial = line.split(/\s+/)[0];
			const model = /model:(\S+)/.exec(line)?.[1]?.replace(/_/g, " ") ?? serial;
			return { serial, model };
		});
}

export async function listAndroidDevices(): Promise<AndroidDevice[]> {
	const dir = await resolveScrcpyDir();
	if (!dir) return [];
	try {
		const { stdout } = await execFileAsync(path.join(dir, "adb.exe"), ["devices", "-l"], {
			windowsHide: true,
			timeout: 8000,
		});
		return parseAdbDevices(stdout);
	} catch {
		return [];
	}
}

export async function startAndroidRecording(serial: string, recordingsDir: string) {
	if (scrcpyProcess) return { success: false as const, message: "Android recording already active." };
	const dir = await resolveScrcpyDir();
	if (!dir) return { success: false as const, message: "scrcpy가 설치 파일에 없어요." };
	const stamp = Date.now();
	recordingMkvPath = path.join(app.getPath("temp"), `recordly-android-${stamp}.mkv`);
	recordingMp4Path = path.join(recordingsDir, `recording-${stamp}.mp4`);
	const child = spawn(
		path.join(dir, "scrcpy.exe"),
		[
			"-s", serial,
			"--no-window",
			"--no-audio-playback",
			"--record", recordingMkvPath,
			"--record-format=mkv",
			"--show-touches",
			"--video-codec=h264",
			"--video-bit-rate=20M",
			"--max-fps=60",
			"--stay-awake",
		],
		{ cwd: dir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
	);
	let log = "";
	child.stdout?.on("data", (chunk) => (log += String(chunk)));
	child.stderr?.on("data", (chunk) => (log += String(chunk)));
	scrcpyProcess = child;
	child.once("exit", () => {
		if (scrcpyProcess === child) scrcpyProcess = null;
	});
	// scrcpy exits quickly when the device/permission is unavailable.
	const exitedEarly = await new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), 2500);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve(true);
		});
	});
	if (exitedEarly) {
		scrcpyProcess = null;
		return { success: false as const, message: `안드로이드 녹화를 시작하지 못했어요.\n${log.trim().slice(-400)}` };
	}
	return { success: true as const };
}

export async function stopAndroidRecording() {
	const child = scrcpyProcess;
	const mkv = recordingMkvPath;
	const mp4 = recordingMp4Path;
	if (!child || !mkv || !mp4) return { success: false as const, message: "No Android recording is active." };
	await new Promise<void>((resolve) => {
		child.once("exit", () => resolve());
		child.kill();
		setTimeout(resolve, 5000);
	});
	scrcpyProcess = null;
	await execFileAsync(
		getFfmpegBinaryPath(),
		["-y", "-v", "error", "-i", mkv, "-c", "copy", "-movflags", "+faststart", mp4],
		{ windowsHide: true, timeout: 120000 },
	);
	await fs.rm(mkv, { force: true });
	return { success: true as const, path: mp4 };
}
