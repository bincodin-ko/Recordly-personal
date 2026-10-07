import { expect, it } from "vitest";
import { parseWhisperJsonCues, whisperDtwPreset } from "./parser";

// Whisper writes raw bytes and can split one UTF-8 character across two tokens.
it("keeps Korean words whose characters span tokens, zero-length fillers and DTW times", () => {
	const ja = Buffer.from("자", "utf8").toString("latin1");
	const mak = Buffer.from("막", "utf8").toString("latin1");
	const json = JSON.stringify({
		transcription: [
			{
				offsets: { from: 0, to: 3000 },
				text: Buffer.from(" 음, 자막", "utf8").toString("latin1"),
				tokens: [
					{ text: Buffer.from(" 음", "utf8").toString("latin1"), offsets: { from: 500, to: 500 }, t_dtw: 80 },
					{ text: ",", offsets: { from: 500, to: 600 }, t_dtw: 90 },
					{ text: ` ${ja}${mak.slice(0, 1)}`, offsets: { from: 600, to: 900 }, t_dtw: 120 },
					{ text: mak.slice(1), offsets: { from: 900, to: 1200 }, t_dtw: 150 },
				],
			},
		],
	});
	const [cue] = parseWhisperJsonCues(json, true);
	expect(cue.text).toBe("음, 자막");
	expect(cue.words).toEqual([
		{ text: "음,", startMs: 500, endMs: 800 },
		{ text: "자막", startMs: 900, endMs: 1500, leadingSpace: true },
	]);
});

it("maps stock model files to DTW presets", () => {
	expect(whisperDtwPreset("C:\\data\\whisper\\ggml-small.bin")).toBe("small");
	expect(whisperDtwPreset("/m/ggml-base.en.bin")).toBe("base.en");
	expect(whisperDtwPreset("/m/ggml-large-v3-turbo-q5_0.bin")).toBe("large.v3.turbo");
	expect(whisperDtwPreset("/m/my-model.bin")).toBeNull();
});
