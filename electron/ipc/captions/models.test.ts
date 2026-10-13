import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildWhisperBaseArgs,
	getWhisperModelPath,
	normalizeWhisperModelId,
	WHISPER_MODELS,
} from "./models";

describe("whisper models", () => {
	it("maps each size to its ggml file in the model dir", () => {
		expect(getWhisperModelPath("/d", "base")).toBe(path.join("/d", "ggml-base.bin"));
		expect(getWhisperModelPath("/d", "medium")).toBe(path.join("/d", "ggml-medium.bin"));
		expect(getWhisperModelPath("/d", undefined)).toBe(path.join("/d", "ggml-small.bin"));
		expect(normalizeWhisperModelId("huge")).toBe("small");
	});

	it("uses official whisper.cpp urls and sha256 hashes", () => {
		for (const model of Object.values(WHISPER_MODELS)) {
			expect(model.url).toMatch(/^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\//);
			expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("adds --prompt only when frequent words are given", () => {
		const base = { modelPath: "m.bin", wavPath: "a.wav", outputBase: "o", language: "ko" };
		const none = buildWhisperBaseArgs({ ...base, prompt: "  " });
		expect(none).not.toContain("--prompt");
		expect(none.slice(0, 2)).toEqual(["-m", "m.bin"]);
		const withPrompt = buildWhisperBaseArgs({ ...base, prompt: " Recordly, 쿠버네티스 " });
		expect(withPrompt.slice(-2)).toEqual(["--prompt", "Recordly, 쿠버네티스"]);
	});
});
