// AI voiceover: text → wav with a local TTS engine, run by a Python worker.
// Everything (venvs, pip/uv caches, model weights) lives in userData/models/tts —
// delete that folder to undo it. Packages come from PyPI / the official PyTorch index,
// weights from the official Qwen and Supertone Hugging Face repos.
//   qwen       Qwen3-TTS 1.7B CustomVoice (Apache-2.0), NVIDIA GPU (CUDA 12.8 torch for RTX 50xx)
//   supertonic Supertonic 3 (OpenRAIL-M, commercial use allowed), ONNX on CPU
import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";
import { type WebContents, ipcMain } from "electron";
import { USER_DATA_PATH } from "../../appPaths";
import { rememberApprovedLocalReadPath } from "../project/manager";
import { getRecordingsDir } from "../utils";
import workerSource from "./worker.py?raw";

const execFileAsync = promisify(execFile);
const TTS_DIR = path.join(USER_DATA_PATH, "models", "tts");

export type VoiceoverEngine = "qwen" | "supertonic";

const ENGINES: Record<
	VoiceoverEngine,
	{ installs: string[][]; model: string; revision: string; voices: string[] }
> = {
	qwen: {
		installs: [
			["torch==2.11.0", "torchaudio==2.11.0", "--index-url", "https://download.pytorch.org/whl/cu128"],
			["qwen-tts==0.1.1"],
		],
		model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
		revision: "0c0e3051f131929182e2c023b9537f8b1c68adfe",
		voices: ["Sohee", "Vivian", "Serena", "Ono_Anna", "Ryan", "Aiden", "Eric", "Dylan", "Uncle_Fu"],
	},
	supertonic: {
		installs: [["supertonic==1.3.1"]],
		model: "supertonic-3",
		revision: "", // pinned inside the supertonic package
		voices: ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"],
	},
};

/** Hangul anywhere → Korean, otherwise English. */
export function detectVoiceoverLanguage(text: string): "ko" | "en" {
	return /[ㄱ-ㆎ가-힣]/.test(text) ? "ko" : "en";
}

function childEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		UV_CACHE_DIR: path.join(TTS_DIR, "uv-cache"),
		PIP_CACHE_DIR: path.join(TTS_DIR, "pip-cache"),
		HF_HOME: path.join(TTS_DIR, "hf"),
		SUPERTONIC_CACHE_DIR: path.join(TTS_DIR, "supertonic3"),
		HF_HUB_DISABLE_TELEMETRY: "1",
		DO_NOT_TRACK: "1",
		PYTHONUTF8: "1",
		PYTHONIOENCODING: "utf-8",
	};
}

let hasNvidiaGpuPromise: Promise<boolean> | null = null;
function hasNvidiaGpu() {
	hasNvidiaGpuPromise ??= execFileAsync("nvidia-smi", ["-L"], { windowsHide: true }).then(
		({ stdout }) => /GPU \d+:/.test(stdout),
		() => false,
	);
	return hasNvidiaGpuPromise;
}

const venvPython = (engine: VoiceoverEngine) =>
	path.join(TTS_DIR, `venv-${engine}`, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

function run(command: string, args: string[], onLine: (line: string) => void): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env: childEnv(), windowsHide: true });
		const tail: string[] = [];
		const collect = (stream: NodeJS.ReadableStream) =>
			readline.createInterface({ input: stream }).on("line", (line) => {
				tail.push(line);
				if (tail.length > 20) tail.shift();
				onLine(line);
			});
		collect(child.stdout);
		collect(child.stderr);
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`${path.basename(command)} exited ${code}: ${tail.join("\n")}`)),
		);
	});
}

async function findBasePython(): Promise<string> {
	// The user's own CPython 3.12 (py launcher); torch/qwen-tts wheels exist for it.
	const { stdout } = await execFileAsync("py", ["-3.12", "-c", "import sys;print(sys.executable)"], {
		windowsHide: true,
	});
	return stdout.trim();
}

async function hasUv(): Promise<boolean> {
	return execFileAsync("uv", ["--version"], { windowsHide: true }).then(
		() => true,
		() => false,
	);
}

async function ensureRuntime(engine: VoiceoverEngine, onLine: (line: string) => void) {
	const marker = path.join(TTS_DIR, `venv-${engine}`, ".recordly-ready");
	const spec = JSON.stringify(ENGINES[engine].installs);
	if ((await fs.readFile(marker, "utf8").catch(() => "")) === spec) return;

	await fs.mkdir(TTS_DIR, { recursive: true });
	const basePython = await findBasePython();
	const python = venvPython(engine);
	const venvDir = path.join(TTS_DIR, `venv-${engine}`);
	const uv = await hasUv();
	if (uv) await run("uv", ["venv", "--allow-existing", "--python", basePython, venvDir], onLine);
	else await run(basePython, ["-m", "venv", venvDir], onLine);
	for (const packages of ENGINES[engine].installs) {
		if (uv) await run("uv", ["pip", "install", "--python", python, ...packages], onLine);
		else await run(python, ["-m", "pip", "install", "--disable-pip-version-check", ...packages], onLine);
	}
	await fs.writeFile(marker, spec);
}

type Pending = { resolve: (reply: WorkerReply) => void };
type WorkerReply = {
	id: string;
	ok: boolean;
	error?: string;
	durationSec?: number;
	computeSec?: number;
	loadSec?: number;
};
type Worker = { child: ChildProcessWithoutNullStreams; ready: Promise<WorkerReply>; pending: Map<string, Pending> };
const workers = new Map<VoiceoverEngine, Worker>();

async function startWorker(engine: VoiceoverEngine): Promise<Worker> {
	const existing = workers.get(engine);
	if (existing && existing.child.exitCode === null) return existing;

	const scriptPath = path.join(TTS_DIR, "worker.py");
	await fs.writeFile(scriptPath, workerSource);
	const child = spawn(venvPython(engine), [
		"-I",
		scriptPath,
		engine,
		ENGINES[engine].model,
		ENGINES[engine].revision,
		path.join(TTS_DIR, `${engine}-model`),
	], {
		env: childEnv(),
		windowsHide: true,
	});
	const pending = new Map<string, Pending>();
	let stderrTail = "";
	child.stderr.on("data", (chunk) => {
		stderrTail = (stderrTail + chunk.toString()).slice(-2000);
	});
	const ready = new Promise<WorkerReply>((resolve) => pending.set("load", { resolve }));
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		let reply: WorkerReply;
		try {
			reply = JSON.parse(line);
		} catch {
			return;
		}
		pending.get(reply.id)?.resolve(reply);
		pending.delete(reply.id);
	});
	child.on("close", (code) => {
		workers.delete(engine);
		for (const [id, waiter] of pending) {
			waiter.resolve({ id, ok: false, error: `worker exited ${code}: ${stderrTail}` });
		}
		pending.clear();
	});
	const worker = { child, ready, pending };
	workers.set(engine, worker);
	return worker;
}

let nextRequestId = 1;

export async function generateVoiceover(
	request: { text: string; voice?: string; engine?: VoiceoverEngine | "auto" },
	sender?: WebContents,
) {
	const progress = (stage: string, detail?: string) => {
		if (sender && !sender.isDestroyed()) sender.send("voiceover-progress", { stage, detail });
	};
	const text = request.text?.trim();
	if (!text) return { success: false, error: "empty text" };
	const engine: VoiceoverEngine =
		request.engine === "qwen" || request.engine === "supertonic"
			? request.engine
			: (await hasNvidiaGpu())
				? "qwen"
				: "supertonic";
	const voice = ENGINES[engine].voices.includes(request.voice ?? "")
		? (request.voice as string)
		: ENGINES[engine].voices[0];
	const lang = detectVoiceoverLanguage(text);

	try {
		progress("installing");
		await ensureRuntime(engine, (line) => progress("installing", line.slice(0, 160)));
		progress("loading");
		const worker = await startWorker(engine);
		const loaded = await worker.ready;
		if (!loaded.ok) throw new Error(loaded.error);

		progress("generating");
		const outDir = path.join(await getRecordingsDir(), "voiceovers");
		const outPath = path.join(outDir, `voiceover-${Date.now()}.wav`);
		const id = String(nextRequestId++);
		const reply = await new Promise<WorkerReply>((resolve) => {
			worker.pending.set(id, { resolve });
			worker.child.stdin.write(`${JSON.stringify({ id, text, voice, lang, out: outPath })}\n`);
		});
		if (!reply.ok) throw new Error(reply.error);
		await rememberApprovedLocalReadPath(outPath);
		const durationSec = reply.durationSec ?? 0;
		const computeSec = reply.computeSec ?? 0;
		console.log(
			`[voiceover] ${engine}/${voice}/${lang}: ${durationSec.toFixed(2)}s audio in ${computeSec.toFixed(2)}s (${(durationSec / Math.max(computeSec, 1e-6)).toFixed(2)}x), load ${loaded.loadSec?.toFixed(1)}s`,
		);
		return { success: true, path: outPath, engine, voice, lang, durationSec, computeSec, loadSec: loaded.loadSec };
	} catch (error) {
		console.error("[voiceover] failed:", error);
		return { success: false, engine, error: String(error instanceof Error ? error.message : error) };
	}
}

export async function getVoiceoverOptions() {
	const gpu = await hasNvidiaGpu();
	return {
		defaultEngine: (gpu ? "qwen" : "supertonic") as VoiceoverEngine,
		gpu,
		voices: { qwen: ENGINES.qwen.voices, supertonic: ENGINES.supertonic.voices },
	};
}

export function registerVoiceoverHandlers() {
	ipcMain.handle("get-voiceover-options", () => getVoiceoverOptions());
	ipcMain.handle("generate-voiceover", (event, request) => generateVoiceover(request, event.sender));
}
