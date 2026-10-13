import fs from "node:fs/promises";
import path from "node:path";

export type RawFileKind = "screen" | "camera" | "microphone" | "system";
export type RawFilePlanItem = { kind: RawFileKind; src: string; dest: string };

/**
 * Lists the original files of one recording to copy into `destDir`:
 * screen video, camera video, and mic/system audio sidecars. Missing or empty
 * files are skipped; names are kept so the files stay recognizable together.
 */
export async function buildRawFilePlan(options: {
	videoPath: string;
	webcamPath?: string | null;
	destDir: string;
	companions: Array<{ kind: "microphone" | "system"; src: string }>;
	sizeOf?: (file: string) => Promise<number>;
}): Promise<RawFilePlanItem[]> {
	const sizeOf = options.sizeOf ?? (async (file) => (await fs.stat(file)).size);
	const candidates: Array<{ kind: RawFileKind; src: string }> = [
		{ kind: "screen", src: options.videoPath },
		...(options.webcamPath ? [{ kind: "camera" as const, src: options.webcamPath }] : []),
		...options.companions,
	];
	const plan: RawFilePlanItem[] = [];
	const used = new Set<string>();
	for (const candidate of candidates) {
		if (used.has(candidate.src)) continue;
		const size = await sizeOf(candidate.src).catch(() => 0);
		if (size <= 0) continue;
		used.add(candidate.src);
		plan.push({ ...candidate, dest: path.join(options.destDir, path.basename(candidate.src)) });
	}
	return plan;
}
