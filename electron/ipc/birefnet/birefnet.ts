// High-quality camera background removal for export: BiRefNet_lite (MIT) run by a Python worker
// with onnxruntime-directml. Everything (venv, pip cache, model, cached mattes) lives in
// userData/models/birefnet — delete that folder to undo it.
// Sources: onnxruntime-directml / numpy / pillow from PyPI; the fp16 ONNX export of ZhengPeng7's
// BiRefNet_lite from onnx-community on Hugging Face, pinned by revision and sha256.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";
import { type WebContents, ipcMain } from "electron";
import { USER_DATA_PATH } from "../../appPaths";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { rememberApprovedLocalReadPath } from "../project/manager";
import workerSource from "./worker.py?raw";

const execFileAsync = promisify(execFile);
const DIR = path.join(USER_DATA_PATH, "models", "birefnet");
const VENV = path.join(DIR, "venv");
const PACKAGES = ["onnxruntime-directml==1.24.4", "numpy==2.5.3", "pillow==12.3.0"];
const MODEL = {
	file: "model_fp16.onnx",
	url: "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model_fp16.onnx",
	sha256: "d39b897ceb16ae654c1731f3dba0cf9b368d9cae74b5a57459b455cc8bfec402",
};
/** Bump when the worker output changes so cached mattes are rebuilt. */
const CACHE_VERSION = "v1";
const MATTE_FPS_CAP = 30;
const MATTE_MAX_WIDTH = 1280;

export type BirefnetProgress = {
	stage: "installing" | "downloading" | "matting";
	done?: number;
	total?: number;
};

const env = () => ({
	...process.env,
	PIP_CACHE_DIR: path.join(DIR, "pip-cache"),
	PYTHONUTF8: "1",
	PYTHONIOENCODING: "utf-8",
});
const venvPython = () =>
	path.join(VENV, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const exists = (file: string) =>
	fs.access(file).then(
		() => true,
		() => false,
	);
let active: ChildProcess | null = null;

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env: env(), windowsHide: true });
		let tail = "";
		const keep = (chunk: Buffer) => {
			tail = (tail + chunk.toString()).slice(-1500);
		};
		child.stdout.on("data", keep);
		child.stderr.on("data", keep);
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`${path.basename(command)} exited ${code}: ${tail}`)),
		);
	});
}

async function sha256File(file: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
	return hash.digest("hex");
}

async function ensureRuntime(progress: (p: BirefnetProgress) => void): Promise<string> {
	await fs.mkdir(DIR, { recursive: true });
	const marker = path.join(VENV, ".recordly-ready");
	const spec = JSON.stringify(PACKAGES);
	if ((await fs.readFile(marker, "utf8").catch(() => "")) !== spec) {
		progress({ stage: "installing" });
		// The user's own CPython 3.12 (py launcher), same as the voiceover venvs.
		const { stdout } = await execFileAsync(
			"py",
			["-3.12", "-c", "import sys;print(sys.executable)"],
			{ windowsHide: true },
		);
		await run(stdout.trim(), ["-m", "venv", VENV]);
		await run(venvPython(), ["-m", "pip", "install", "--disable-pip-version-check", ...PACKAGES]);
		await fs.writeFile(marker, spec);
	}
	const model = path.join(DIR, MODEL.file);
	if (!(await exists(model))) {
		progress({ stage: "downloading" });
		const response = await fetch(MODEL.url);
		if (!response.ok) throw new Error(`BiRefNet model download failed (${response.status})`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (createHash("sha256").update(bytes).digest("hex") !== MODEL.sha256) {
			throw new Error("BiRefNet model integrity check failed.");
		}
		await fs.writeFile(model, bytes);
	}
	await fs.writeFile(path.join(DIR, "worker.py"), workerSource);
	return model;
}

/**
 * Builds (or reuses) a grayscale matte video for a camera file: white = person, same frame
 * rate and timeline as the camera. Cached by the camera file's content hash and the settings.
 */
export async function prepareBirefnetMatte(
	webcamPath: string,
	progress: (p: BirefnetProgress) => void,
): Promise<{ success: true; path: string; cached: boolean; computeSec?: number; fps?: number }> {
	const ffmpeg = getFfmpegBinaryPath();
	if (!ffmpeg) throw new Error("FFmpeg is unavailable");
	const key = createHash("sha256")
		.update(await sha256File(webcamPath))
		.update(`${CACHE_VERSION}|${MODEL.sha256}|${MATTE_FPS_CAP}|${MATTE_MAX_WIDTH}`)
		.digest("hex")
		.slice(0, 24);
	const out = path.join(DIR, "cache", `${key}.mp4`);
	if (await exists(out)) {
		await rememberApprovedLocalReadPath(out);
		return { success: true, path: out, cached: true };
	}
	const model = await ensureRuntime(progress);
	await fs.mkdir(path.dirname(out), { recursive: true });
	const partial = `${out}.partial.mp4`;
	const child = spawn(
		venvPython(),
		[
			"-I",
			path.join(DIR, "worker.py"),
			model,
			ffmpeg,
			webcamPath,
			partial,
			String(MATTE_FPS_CAP),
			String(MATTE_MAX_WIDTH),
		],
		{ env: env(), windowsHide: true },
	);
	active = child;
	let stderrTail = "";
	child.stderr.on("data", (chunk) => {
		stderrTail = (stderrTail + chunk.toString()).slice(-1500);
	});
	let done: { computeSec?: number; fps?: number } | null = null;
	let workerError = "";
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		try {
			const msg = JSON.parse(line);
			if (msg.stage === "matting") progress({ stage: "matting", done: msg.done, total: msg.total });
			else if (msg.stage === "done") done = { computeSec: msg.computeSec, fps: msg.fps };
			else if (msg.stage === "error") workerError = msg.error;
		} catch {
			// not a protocol line
		}
	});
	const code = await new Promise<number | null>((resolve) => {
		child.on("error", () => resolve(-1));
		child.on("close", resolve);
	});
	active = null;
	if (code !== 0 || !done) {
		await fs.rm(partial, { force: true });
		throw new Error(workerError || `matte worker exited ${code}: ${stderrTail}`);
	}
	await fs.rename(partial, out);
	await rememberApprovedLocalReadPath(out);
	const result = done as { computeSec?: number; fps?: number };
	console.log(
		`[birefnet] matte ready in ${result.computeSec?.toFixed(1)}s (${path.basename(webcamPath)})`,
	);
	return { success: true, path: out, cached: false, ...result };
}

export function registerBirefnetHandlers() {
	ipcMain.handle("prepare-birefnet-matte", async (event, webcamPath: string) => {
		const sender: WebContents = event.sender;
		try {
			return await prepareBirefnetMatte(webcamPath, (p) => {
				if (!sender.isDestroyed()) sender.send("birefnet-progress", p);
			});
		} catch (error) {
			console.error("[birefnet] failed:", error);
			return {
				success: false as const,
				error: String(error instanceof Error ? error.message : error),
			};
		}
	});
	ipcMain.handle("cancel-birefnet-matte", () => {
		active?.kill();
		active = null;
	});
}
