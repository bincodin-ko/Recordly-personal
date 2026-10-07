import fs from "node:fs/promises";
import { parseSrtCues, parseWhisperJsonCues } from "./parser";

/** Older Whisper builds may emit SRT without the requested word-timing JSON. */
export async function readWhisperCaptionOutput(outputBase: string, jsonEnabled: boolean) {
	if (jsonEnabled) {
		let json = "";
		try {
			// latin1 = raw bytes: Whisper tokens can hold partial UTF-8 characters.
			json = await fs.readFile(`${outputBase}.json`, "latin1");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const timed = json ? parseWhisperJsonCues(json, true) : [];
		if (timed.length) return timed;
		console.warn("[auto-captions] No usable JSON timing output; falling back to SRT.");
	}
	return parseSrtCues(await fs.readFile(`${outputBase}.srt`, "utf8"));
}
