// Screen Studio-style "Microphone audio mode": Noise reduction / Podcast.
// Renders a cleaned copy of the mic sidecar once (cached), which the editor then
// plays and exports in place of the original. Original recordings are never modified.
//
// Noise reduction uses DeepFilterNet3 (deep-filter CLI, MIT/Apache-2.0,
// https://github.com/Rikorose/DeepFilterNet), downloaded on first use into
// userData/models/deepfilternet and verified by sha256. If that is unavailable,
// FFmpeg's built-in afftdn denoiser is used instead so the feature still works.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ipcMain } from "electron";
import { USER_DATA_PATH } from "../../appPaths";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { rememberApprovedLocalReadPath, resolveApprovedLocalMediaPath } from "../project/manager";

const execFileAsync = promisify(execFile);

type MicMode = "noise-reduction" | "podcast";

const DEEP_FILTER_URL =
	"https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-pc-windows-msvc.exe";
const DEEP_FILTER_SHA256 = "75e11fa16445f560cb6b021521ddb89e89270d13b83089705d98776f58fd7915";
const DEEP_FILTER_PATH = path.join(USER_DATA_PATH, "models", "deepfilternet", "deep-filter-0.5.6.exe");
// Bump when the processing chain changes so cached files are re-rendered.
const PIPELINE_VERSION = "1";

// Podcast = cleaned voice + rumble cut, less mud, more presence, gentle
// compression, then two-pass loudness normalization to -16 LUFS (podcast standard).
const PODCAST_TONE_FILTERS = [
	"highpass=f=80",
	"equalizer=f=250:t=q:w=1:g=-2",
	"equalizer=f=3500:t=q:w=1.2:g=3",
	"acompressor=threshold=-20dB:ratio=3:attack=10:release=150:makeup=2",
];
const PODCAST_LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };

let deepFilterReady: Promise<string | null> | null = null;

async function sha256File(filePath: string) {
	return createHash("sha256")
		.update(await fs.readFile(filePath))
		.digest("hex");
}

async function downloadDeepFilter(): Promise<string | null> {
	try {
		if ((await sha256File(DEEP_FILTER_PATH).catch(() => "")) === DEEP_FILTER_SHA256) {
			return DEEP_FILTER_PATH;
		}
		await fs.mkdir(path.dirname(DEEP_FILTER_PATH), { recursive: true });
		const response = await fetch(DEEP_FILTER_URL);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		const digest = createHash("sha256").update(bytes).digest("hex");
		if (digest !== DEEP_FILTER_SHA256) throw new Error(`sha256 mismatch ${digest}`);
		const tempPath = `${DEEP_FILTER_PATH}.download`;
		await fs.writeFile(tempPath, bytes);
		await fs.rename(tempPath, DEEP_FILTER_PATH);
		return DEEP_FILTER_PATH;
	} catch (error) {
		console.warn("[micEnhance] DeepFilterNet unavailable, using FFmpeg afftdn:", error);
		return null;
	}
}

function ensureDeepFilter() {
	deepFilterReady ??= downloadDeepFilter().then((result) => {
		if (!result) deepFilterReady = null; // retry next time
		return result;
	});
	return deepFilterReady;
}

async function runFfmpeg(args: string[]) {
	return execFileAsync(getFfmpegBinaryPath(), ["-y", "-hide_banner", ...args], {
		maxBuffer: 32 * 1024 * 1024,
		windowsHide: true,
	});
}

async function enhance(inputPath: string, mode: MicMode, outPath: string) {
	const workDir = await fs.mkdtemp(path.join(path.dirname(outPath), "work-"));
	try {
		// DeepFilterNet works on 48 kHz audio.
		const decoded = path.join(workDir, "voice.wav");
		await runFfmpeg(["-loglevel", "error", "-i", inputPath, "-vn", "-ar", "48000", "-c:a", "pcm_s16le", decoded]);

		let denoised = path.join(workDir, "denoised.wav");
		const deepFilter = await ensureDeepFilter();
		if (deepFilter) {
			const dfOut = path.join(workDir, "df");
			await execFileAsync(deepFilter, ["--compensate-delay", "-o", dfOut, decoded], {
				maxBuffer: 32 * 1024 * 1024,
				windowsHide: true,
			});
			denoised = path.join(dfOut, "voice.wav");
		} else {
			await runFfmpeg(["-loglevel", "error", "-i", decoded, "-af", "afftdn=nr=20:nf=-40:tn=1", denoised]);
		}

		if (mode === "noise-reduction") {
			await runFfmpeg(["-loglevel", "error", "-i", denoised, "-c:a", "pcm_s16le", outPath]);
			return { engine: deepFilter ? "deepfilternet3" : "afftdn" };
		}

		// Podcast: pass 1 measures loudness after the tone chain, pass 2 applies it linearly.
		const tone = PODCAST_TONE_FILTERS.join(",");
		const { I, TP, LRA } = PODCAST_LOUDNESS;
		const measure = await runFfmpeg([
			"-loglevel", "info", "-i", denoised,
			"-af", `${tone},loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`,
			"-f", "null", "-",
		]);
		const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(measure.stderr)?.[0];
		const m = json ? (JSON.parse(json) as Record<string, string>) : null;
		const loudnorm = m
			? `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
			: `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`;
		await runFfmpeg([
			"-loglevel", "error", "-i", denoised,
			"-af", `${tone},${loudnorm},aresample=48000`,
			"-c:a", "pcm_s16le", outPath,
		]);
		return { engine: deepFilter ? "deepfilternet3" : "afftdn" };
	} finally {
		await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
	}
}

const inFlight = new Map<string, Promise<string>>();

export function registerMicEnhanceHandlers() {
	ipcMain.handle("enhance-mic-audio", async (_event, request: { path: string; mode: string }) => {
		try {
			if (request.mode !== "noise-reduction" && request.mode !== "podcast") {
				return { success: false, error: "unknown mode" };
			}
			const mode = request.mode as MicMode;
			const inputPath = await resolveApprovedLocalMediaPath(request.path);
			if (!inputPath) return { success: false, error: "microphone audio not available" };

			const stat = await fs.stat(inputPath);
			const key = createHash("sha1")
				.update(`${inputPath}|${stat.size}|${stat.mtimeMs}|${mode}|${PIPELINE_VERSION}`)
				.digest("hex")
				.slice(0, 12);
			const outDir = path.join(USER_DATA_PATH, "enhanced-audio");
			await fs.mkdir(outDir, { recursive: true });
			// Keep ".mic." in the name: the renderer routes tracks by file name.
			const stem = path.basename(inputPath).replace(/\.mic\..*$/i, "").replace(/\.[^.]+$/, "");
			const outPath = path.join(outDir, `${stem}-${mode}-${key}.mic.wav`);

			let job = inFlight.get(outPath);
			if (!job) {
				job = (async () => {
					const exists = await fs.stat(outPath).then((s) => s.size > 44).catch(() => false);
					if (!exists) {
						const tempOut = outPath.replace(/\.mic\.wav$/, ".tmp.mic.wav");
						await enhance(inputPath, mode, tempOut);
						await fs.rename(tempOut, outPath);
					}
					await rememberApprovedLocalReadPath(outPath);
					return outPath;
				})().finally(() => inFlight.delete(outPath));
				inFlight.set(outPath, job);
			}
			return { success: true, path: await job };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
}
