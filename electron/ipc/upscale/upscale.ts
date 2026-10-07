// AI text sharpening for export: a Python worker runs Real-ESRGAN realesr-animevideov3
// (BSD-3, official xinntao/Real-ESRGAN GitHub release) on the GPU and returns 2x frames.
// Everything (venv, pip cache, weights) lives in userData/models/upscale — delete it to undo.
// Packages come from the official PyTorch index (CUDA 12.8 build for RTX 50xx) and PyPI.
import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ipcMain } from "electron";
import { USER_DATA_PATH } from "../../appPaths";
import workerSource from "./worker.py?raw";

const execFileAsync = promisify(execFile);
const UPSCALE_DIR = path.join(USER_DATA_PATH, "models", "upscale");
const VENV_DIR = path.join(UPSCALE_DIR, "venv");
const PYTHON = path.join(VENV_DIR, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const INSTALLS = [
	["torch==2.11.0", "--index-url", "https://download.pytorch.org/whl/cu128"],
	["numpy"],
];
const MODEL = {
	name: "realesr-animevideov3",
	url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth",
	sha256: "b8a8376811077954d82ca3fcf476f1ac3da3e8a68a4f4d71363008000a18b75d",
	file: path.join(UPSCALE_DIR, "realesr-animevideov3.pth"),
};

function childEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		PIP_CACHE_DIR: path.join(UPSCALE_DIR, "pip-cache"),
		PYTHONUTF8: "1",
	};
}

function run(command: string, args: string[], onLine: (line: string) => void): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env: childEnv(), windowsHide: true });
		let tail = "";
		const collect = (chunk: Buffer) => {
			const text = chunk.toString();
			tail = (tail + text).slice(-2000);
			const last = text.trim().split(/\r?\n/).pop();
			if (last) onLine(last);
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited ${code}: ${tail}`)),
		);
	});
}

async function sha256(file: string): Promise<string | null> {
	const data = await fs.readFile(file).catch(() => null);
	return data ? createHash("sha256").update(data).digest("hex") : null;
}

async function ensureRuntime(onLine: (line: string) => void) {
	await fs.mkdir(UPSCALE_DIR, { recursive: true });
	const { stdout } = await execFileAsync("nvidia-smi", ["-L"], { windowsHide: true }).catch(() => ({
		stdout: "",
	}));
	if (!/GPU \d+:/.test(stdout)) throw new Error("NVIDIA GPU not found");

	const marker = path.join(VENV_DIR, ".recordly-ready");
	const spec = JSON.stringify(INSTALLS);
	if ((await fs.readFile(marker, "utf8").catch(() => "")) !== spec) {
		// The user's own CPython 3.12 (py launcher); torch cu128 wheels exist for it.
		const { stdout: basePython } = await execFileAsync(
			"py",
			["-3.12", "-c", "import sys;print(sys.executable)"],
			{ windowsHide: true },
		);
		await run(basePython.trim(), ["-m", "venv", VENV_DIR], onLine);
		for (const packages of INSTALLS) {
			await run(PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", ...packages], onLine);
		}
		await fs.writeFile(marker, spec);
	}

	if ((await sha256(MODEL.file)) !== MODEL.sha256) {
		onLine(`download ${MODEL.url}`);
		const response = await fetch(MODEL.url);
		if (!response.ok) throw new Error(`model download failed: HTTP ${response.status}`);
		const data = Buffer.from(await response.arrayBuffer());
		if (createHash("sha256").update(data).digest("hex") !== MODEL.sha256) {
			throw new Error("model checksum mismatch");
		}
		await fs.writeFile(MODEL.file, data);
	}
}

type Reply = { ok: true; width: number; height: number; data: Uint8Array } | { ok: false; error: string };
type Worker = {
	child: ChildProcessWithoutNullStreams;
	waiters: ((reply: Reply) => void)[];
	ready: Promise<Reply>;
};
let worker: Worker | null = null;
let preparing: Promise<{ success: boolean; error?: string }> | null = null;

/** Parses (status, a, b) headers + payloads from the worker's stdout, one reply per waiter. */
function attachReader(target: Worker) {
	// Chunks are joined only once a whole reply arrived (frames are tens of MB in 64 KB chunks).
	let chunks: Buffer[] = [];
	let total = 0;
	let need = 12;
	target.child.stdout.on("data", (chunk: Buffer) => {
		chunks.push(chunk);
		total += chunk.length;
		if (total < need) return;
		let buffered = Buffer.concat(chunks, total);
		while (buffered.length >= 12) {
			const status = buffered.readUInt32LE(0);
			const a = buffered.readUInt32LE(4);
			const b = buffered.readUInt32LE(8);
			const size = status === 0 ? a * b * 4 : a;
			if (buffered.length < 12 + size) break;
			const payload = buffered.subarray(12, 12 + size);
			buffered = buffered.subarray(12 + size);
			const reply: Reply =
				status === 0
					? { ok: true, width: a, height: b, data: payload }
					: { ok: false, error: payload.toString("utf8") };
			target.waiters.shift()?.(reply);
		}
		chunks = buffered.length ? [buffered] : [];
		total = buffered.length;
		need = total >= 12 ? 12 + (buffered.readUInt32LE(0) === 0 ? buffered.readUInt32LE(4) * buffered.readUInt32LE(8) * 4 : buffered.readUInt32LE(4)) : 12;
	});
}

function startWorker(): Worker {
	if (worker && worker.child.exitCode === null) return worker;
	const scriptPath = path.join(UPSCALE_DIR, "worker.py");
	const child = spawn(PYTHON, ["-I", scriptPath, MODEL.name, MODEL.file], {
		env: childEnv(),
		windowsHide: true,
	});
	let stderrTail = "";
	child.stderr.on("data", (chunk) => {
		stderrTail = (stderrTail + chunk.toString()).slice(-2000);
	});
	const next: Worker = { child, waiters: [], ready: Promise.resolve({ ok: false, error: "" }) };
	next.ready = new Promise<Reply>((resolve) => next.waiters.push(resolve));
	attachReader(next);
	const fail = (reason: string) => {
		if (worker === next) worker = null;
		for (const waiter of next.waiters.splice(0)) {
			waiter({ ok: false, error: `upscale worker ${reason}: ${stderrTail}` });
		}
	};
	// A missing/broken venv python fails the spawn; unhandled, that error crashes the main process.
	child.on("error", (error) => fail(`failed (${error.message})`));
	child.stdin.on("error", () => undefined);
	child.on("close", (code) => fail(`exited ${code}`));
	worker = next;
	return next;
}

export function prepareUpscale() {
	preparing ??= (async () => {
		try {
			await ensureRuntime((line) => console.log(`[upscale] ${line.slice(0, 160)}`));
			await fs.writeFile(path.join(UPSCALE_DIR, "worker.py"), workerSource);
			const ready = await startWorker().ready;
			if (!ready.ok) throw new Error(ready.error);
			return { success: true };
		} catch (error) {
			console.error("[upscale] unavailable:", error);
			return { success: false, error: String(error instanceof Error ? error.message : error) };
		} finally {
			preparing = null;
		}
	})();
	return preparing;
}

export async function upscaleFrame(data: Uint8Array, width: number, height: number) {
	const target = worker && worker.child.exitCode === null ? worker : null;
	if (!target || data.byteLength !== width * height * 4) {
		return { success: false as const, error: "upscale worker not ready" };
	}
	const reply = await new Promise<Reply>((resolve) => {
		target.waiters.push(resolve);
		const header = Buffer.alloc(12);
		header.writeUInt32LE(width, 0);
		header.writeUInt32LE(height, 4);
		target.child.stdin.write(header);
		target.child.stdin.write(data);
	});
	return reply.ok
		? { success: true as const, width: reply.width, height: reply.height, data: reply.data }
		: { success: false as const, error: reply.error };
}

export function registerUpscaleHandlers() {
	ipcMain.handle("prepare-upscale", () => prepareUpscale());
	ipcMain.handle("upscale-frame", (_event, data: Uint8Array, width: number, height: number) =>
		upscaleFrame(data, width, height),
	);
}
