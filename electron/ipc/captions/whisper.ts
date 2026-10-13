import { createWriteStream } from "node:fs";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { get as httpsGet } from "node:https";
import type Electron from "electron";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { WHISPER_MODEL_DIR } from "../constants";
import { getWhisperModelPath, normalizeWhisperModelId, WHISPER_MODELS } from "./models";

export function sendWhisperModelDownloadProgress(
	webContents: Electron.WebContents,
	payload: {
		status: "idle" | "downloading" | "downloaded" | "error";
		progress: number;
		model?: string;
		path?: string | null;
		error?: string;
	},
) {
	webContents.send("whisper-small-model-download-progress", payload);
}

export async function getWhisperSmallModelStatus(model?: unknown) {
	const modelPath = getWhisperModelPath(WHISPER_MODEL_DIR, model);
	try {
		await fs.access(modelPath, fsConstants.R_OK);
		return { success: true, exists: true, path: modelPath };
	} catch {
		return { success: true, exists: false, path: null };
	}
}

function sha256OfFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		createReadStream(filePath)
			.on("data", (chunk) => hash.update(chunk))
			.on("error", reject)
			.on("end", () => resolve(hash.digest("hex")));
	});
}

export function downloadFileWithProgress(
	url: string,
	destinationPath: string,
	onProgress: (progress: number) => void,
): Promise<void> {
	const request = (currentUrl: string, redirectCount = 0): Promise<void> => {
		return new Promise((resolve, reject) => {
			const req = httpsGet(currentUrl, { timeout: 30_000 }, (response) => {
				const statusCode = response.statusCode ?? 0;
				const location = response.headers.location;

				if (statusCode >= 300 && statusCode < 400 && location) {
					response.resume();
					if (redirectCount >= 5) {
						reject(new Error("Too many redirects while downloading Whisper model."));
						return;
					}

					const nextUrl = new URL(location, currentUrl).toString();
					void request(nextUrl, redirectCount + 1)
						.then(resolve)
						.catch(reject);
					return;
				}

				if (statusCode < 200 || statusCode >= 300) {
					response.resume();
					reject(new Error(`Whisper model download failed with status ${statusCode}.`));
					return;
				}

				const totalBytes = Number.parseInt(
					String(response.headers["content-length"] ?? "0"),
					10,
				);
				let downloadedBytes = 0;
				const fileStream = createWriteStream(destinationPath);

				response.on("data", (chunk: Buffer) => {
					downloadedBytes += chunk.length;
					if (Number.isFinite(totalBytes) && totalBytes > 0) {
						onProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
					}
				});

				response.on("error", (error) => {
					fileStream.destroy(error);
				});

				fileStream.on("error", (error) => {
					response.destroy(error);
					reject(error);
				});

				fileStream.on("finish", () => {
					onProgress(100);
					resolve();
				});

				response.pipe(fileStream);
			});

			req.on("error", reject);
			req.on("timeout", () => {
				req.destroy(new Error("Whisper model download timed out."));
			});
		});
	};

	return request(url);
}

export async function downloadWhisperSmallModel(
	webContents: Electron.WebContents,
	modelInput?: unknown,
): Promise<string> {
	const model = normalizeWhisperModelId(modelInput);
	const info = WHISPER_MODELS[model];
	const modelPath = getWhisperModelPath(WHISPER_MODEL_DIR, model);
	await fs.mkdir(WHISPER_MODEL_DIR, { recursive: true });
	const tempPath = `${modelPath}.download`;
	const send = (payload: Parameters<typeof sendWhisperModelDownloadProgress>[1]) =>
		sendWhisperModelDownloadProgress(webContents, { ...payload, model });

	send({ status: "downloading", progress: 0, path: null });

	try {
		await fs.rm(tempPath, { force: true });
		await downloadFileWithProgress(info.url, tempPath, (progress) => {
			send({ status: "downloading", progress, path: null });
		});
		if ((await sha256OfFile(tempPath)) !== info.sha256) {
			throw new Error("Whisper model checksum mismatch; the download was discarded.");
		}
		await fs.rename(tempPath, modelPath);
		send({ status: "downloaded", progress: 100, path: modelPath });
		return modelPath;
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		send({ status: "error", progress: 0, path: null, error: String(error) });
		throw error;
	}
}

export async function deleteWhisperSmallModel(model?: unknown): Promise<void> {
	await fs.rm(getWhisperModelPath(WHISPER_MODEL_DIR, model), { force: true });
}
