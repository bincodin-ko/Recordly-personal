import path from "node:path";

export type WhisperModelId = "base" | "small" | "medium";

const BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

// sha256 = HuggingFace LFS hash (x-linked-etag) of the official ggerganov/whisper.cpp files.
export const WHISPER_MODELS: Record<
	WhisperModelId,
	{ file: string; url: string; sha256: string; bytes: number }
> = {
	base: {
		file: "ggml-base.bin",
		url: `${BASE_URL}/ggml-base.bin`,
		sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
		bytes: 147951465,
	},
	small: {
		file: "ggml-small.bin",
		url: `${BASE_URL}/ggml-small.bin`,
		sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
		bytes: 487601967,
	},
	medium: {
		file: "ggml-medium.bin",
		url: `${BASE_URL}/ggml-medium.bin`,
		sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
		bytes: 1533763059,
	},
};

export function normalizeWhisperModelId(value: unknown): WhisperModelId {
	return value === "base" || value === "medium" ? value : "small";
}

export function getWhisperModelPath(dir: string, model: unknown): string {
	return path.join(dir, WHISPER_MODELS[normalizeWhisperModelId(model)].file);
}

/** Args shared by every whisper-cli run. `prompt` (frequent words) biases spelling. */
export function buildWhisperBaseArgs(opts: {
	modelPath: string;
	wavPath: string;
	outputBase: string;
	language: string;
	prompt?: string;
}): string[] {
	const prompt = opts.prompt?.trim();
	return [
		"-m",
		opts.modelPath,
		"-f",
		opts.wavPath,
		"-osrt",
		"-of",
		opts.outputBase,
		"-l",
		opts.language,
		"-np",
		// Do not carry a hallucinated phrase through later decoding windows.
		"-mc",
		"0",
		...(prompt ? ["--prompt", prompt] : []),
	];
}
