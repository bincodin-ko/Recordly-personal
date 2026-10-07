// Screen Studio-style editor helpers: copy the preview frame as an image and pull a
// clip's original audio out into its own file (becomes a free-standing audio track).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { clipboard, ipcMain } from "electron";
import { USER_DATA_PATH } from "../../appPaths";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { rememberApprovedLocalReadPath, resolveApprovedLocalMediaPath } from "../project/manager";
import {
	getCompanionAudioFallbackInfo,
	hasEmbeddedAudioStream,
} from "../recording/diagnostics";

const execFileAsync = promisify(execFile);

type FrameRect = { x: number; y: number; width: number; height: number };
type ExtractRequest = { videoPath: string; startMs: number; endMs: number; speed?: number };

/** atempo only accepts 0.5-2 per filter, so chain it for other speeds. */
export function buildAtempoChain(speed: number): string[] {
	const filters: string[] = [];
	let remaining = speed;
	while (remaining > 2) {
		filters.push("atempo=2");
		remaining /= 2;
	}
	while (remaining < 0.5) {
		filters.push("atempo=0.5");
		remaining /= 0.5;
	}
	if (Math.abs(remaining - 1) > 1e-6) filters.push(`atempo=${remaining.toFixed(5)}`);
	return filters;
}

export function registerEditorExtrasHandlers() {
	ipcMain.handle("copy-preview-frame-to-clipboard", async (event, rect: FrameRect) => {
		try {
			const bounds = {
				x: Math.max(0, Math.round(rect.x)),
				y: Math.max(0, Math.round(rect.y)),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
			};
			if (!(bounds.width > 0 && bounds.height > 0)) {
				return { success: false, error: "empty frame" };
			}
			const image = await event.sender.capturePage(bounds);
			if (image.isEmpty()) return { success: false, error: "empty capture" };
			clipboard.writeImage(image);
			const size = clipboard.readImage().getSize();
			return { success: size.width > 0, width: size.width, height: size.height };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("extract-clip-audio", async (_event, request: ExtractRequest) => {
		try {
			const videoPath = await resolveApprovedLocalMediaPath(request.videoPath);
			if (!videoPath) return { success: false, error: "video not available" };
			const startMs = Math.max(0, Math.round(request.startMs));
			const durationMs = Math.round(request.endMs) - startMs;
			if (!(durationMs > 0)) return { success: false, error: "empty range" };
			const speed =
				Number.isFinite(request.speed) && (request.speed as number) > 0
					? (request.speed as number)
					: 1;

			const info = await getCompanionAudioFallbackInfo(videoPath);
			const sources =
				info.paths.length > 0
					? info.paths
					: (await hasEmbeddedAudioStream(videoPath))
						? [videoPath]
						: [];
			if (sources.length === 0) return { success: false, error: "no audio" };

			const outDir = path.join(USER_DATA_PATH, "extracted-audio");
			await fs.mkdir(outDir, { recursive: true });
			const key = createHash("sha1")
				.update(`${videoPath}|${startMs}|${durationMs}|${speed}`)
				.digest("hex")
				.slice(0, 12);
			const outPath = path.join(outDir, `${path.basename(videoPath, path.extname(videoPath))}-${key}.wav`);

			const delays = info.startDelayMsByPath as Record<string, number>;
			const args = ["-y", "-hide_banner", "-loglevel", "error"];
			const chains: string[] = [];
			sources.forEach((source, index) => {
				// A companion file's t=0 sits `delay` ms after video t=0.
				const delay = delays[source] ?? 0;
				const fileStartMs = startMs - delay;
				const seekMs = Math.max(0, fileStartMs);
				const padMs = Math.max(0, -fileStartMs);
				args.push("-ss", (seekMs / 1000).toFixed(3), "-t", (durationMs / 1000).toFixed(3), "-i", source);
				chains.push(
					`[${index}:a:0]${padMs > 0 ? `adelay=${padMs}|${padMs},` : ""}apad,atrim=0:${(durationMs / 1000).toFixed(3)}[a${index}]`,
				);
			});
			const mixInputs = sources.map((_, index) => `[a${index}]`).join("");
			const tail = ["aresample=48000", ...buildAtempoChain(speed)].join(",");
			const mix =
				sources.length > 1
					? `${mixInputs}amix=inputs=${sources.length}:normalize=0:duration=longest,${tail}[out]`
					: `${mixInputs}${tail}[out]`;
			args.push(
				"-filter_complex",
				`${chains.join(";")};${mix}`,
				"-map",
				"[out]",
				"-c:a",
				"pcm_s16le",
				outPath,
			);
			await execFileAsync(getFfmpegBinaryPath(), args, { maxBuffer: 16 * 1024 * 1024 });
			await rememberApprovedLocalReadPath(outPath);
			return {
				success: true,
				path: outPath,
				durationMs: Math.round(durationMs / speed),
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
}
