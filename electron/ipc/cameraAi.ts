// Camera AI runtime (background removal + face tracking) downloaded on first use.
// Everything lives in userData/models/camera-ai — delete that folder to undo it.
// Sources are official and pinned by hash: MediaPipe Tasks Vision (Apache-2.0) from the npm
// registry, and Google's selfie segmenter / BlazeFace short-range models from Google storage.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { ipcMain } from "electron";
import { USER_DATA_PATH } from "../appPaths";

const CAMERA_AI_DIR = path.join(USER_DATA_PATH, "models", "camera-ai");
const TASKS_VISION_VERSION = "1.1.0";
const TASKS_VISION_TARBALL = {
	url: `https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${TASKS_VISION_VERSION}.tgz`,
	sha512: "ZJqh0wMKOINorfSffvDAxzyO1//c+FiG3IkzOdNDnLqvBB3DbMfj0bB/tys2SNf9S914sgoIbIpF4HTOi336cg==",
	files: {
		bundle: "package/vision_bundle.mjs",
		loader: "package/wasm/vision_wasm_internal.js",
		wasm: "package/wasm/vision_wasm_internal.wasm",
	},
};
const MODELS = {
	segmenter: {
		url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
		sha256: "191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b",
	},
	face: {
		url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
		sha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
	},
};

export type CameraAiRuntimeFiles = Record<
	keyof typeof TASKS_VISION_TARBALL.files | keyof typeof MODELS,
	Uint8Array
>;

async function download(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
	return Buffer.from(await response.arrayBuffer());
}

/** Minimal ustar reader: returns the requested entries of a (gunzipped) tarball. */
export function extractTarEntries(tar: Buffer, wanted: string[]): Map<string, Buffer> {
	const found = new Map<string, Buffer>();
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		const name = header.toString("utf8", 0, 100).replace(/\0.*$/s, "");
		if (!name) break;
		const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/s, "");
		const size = Number.parseInt(
			header.toString("utf8", 124, 136).replace(/\0.*$/s, "").trim() || "0",
			8,
		);
		const fullName = prefix ? `${prefix}/${name}` : name;
		if (wanted.includes(fullName)) {
			found.set(fullName, Buffer.from(tar.subarray(offset + 512, offset + 512 + size)));
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return found;
}

let installPromise: Promise<void> | null = null;

async function installCameraAiRuntime(): Promise<void> {
	await fs.mkdir(CAMERA_AI_DIR, { recursive: true });
	const names = Object.keys(TASKS_VISION_TARBALL.files) as Array<
		keyof typeof TASKS_VISION_TARBALL.files
	>;
	const missingRuntime = await Promise.all(
		names.map((name) =>
			fs.access(path.join(CAMERA_AI_DIR, `${name}.bin`)).then(
				() => false,
				() => true,
			),
		),
	);
	if (missingRuntime.some(Boolean)) {
		const tarball = await download(TASKS_VISION_TARBALL.url);
		const digest = createHash("sha512").update(tarball).digest("base64");
		if (digest !== TASKS_VISION_TARBALL.sha512) {
			throw new Error("MediaPipe runtime integrity check failed.");
		}
		const entries = extractTarEntries(
			gunzipSync(tarball),
			Object.values(TASKS_VISION_TARBALL.files),
		);
		for (const name of names) {
			const entry = entries.get(TASKS_VISION_TARBALL.files[name]);
			if (!entry) throw new Error(`MediaPipe runtime is missing ${name}.`);
			await fs.writeFile(path.join(CAMERA_AI_DIR, `${name}.bin`), entry);
		}
	}

	for (const [name, model] of Object.entries(MODELS)) {
		const target = path.join(CAMERA_AI_DIR, `${name}.bin`);
		const exists = await fs.access(target).then(
			() => true,
			() => false,
		);
		if (exists) continue;
		const bytes = await download(model.url);
		if (createHash("sha256").update(bytes).digest("hex") !== model.sha256) {
			throw new Error(`Camera AI model integrity check failed: ${name}.`);
		}
		await fs.writeFile(target, bytes);
	}
}

export async function loadCameraAiRuntime(): Promise<CameraAiRuntimeFiles> {
	installPromise ??= installCameraAiRuntime().catch((error) => {
		installPromise = null;
		throw error;
	});
	await installPromise;
	const keys = [...Object.keys(TASKS_VISION_TARBALL.files), ...Object.keys(MODELS)] as Array<
		keyof CameraAiRuntimeFiles
	>;
	const files = {} as CameraAiRuntimeFiles;
	for (const key of keys) {
		files[key] = new Uint8Array(await fs.readFile(path.join(CAMERA_AI_DIR, `${key}.bin`)));
	}
	return files;
}

export function registerCameraAiHandlers() {
	ipcMain.handle("load-camera-ai-runtime", async () => {
		try {
			return { success: true, files: await loadCameraAiRuntime() };
		} catch (error) {
			console.error("[camera-ai] Failed to load runtime:", error);
			return { success: false, error: String(error) };
		}
	});
}
