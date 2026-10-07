import type {
	CaptionCuePayload,
	CaptionWordPayload,
	WhisperJsonSegment,
	WhisperJsonToken,
} from "../types";

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function buildCaptionTextFromWords(words: CaptionWordPayload[]): string {
	return words
		.map((word, index) => `${index > 0 && word.leadingSpace ? " " : ""}${word.text}`)
		.join("")
		.trim();
}

/**
 * `rawBytes`: strings were read as latin1, one char per byte. Whisper splits multi-byte
 * UTF-8 characters (e.g. Korean) across tokens, so words are decoded only once whole.
 */
const decodeRaw = (value: string) => Buffer.from(value, "latin1").toString("utf8");

export function parseWhisperJsonWords(tokens: unknown, rawBytes = false): CaptionWordPayload[] {
	if (!Array.isArray(tokens)) {
		return [];
	}
	const decode = rawBytes ? decodeRaw : (value: string) => value;

	const words: CaptionWordPayload[] = [];
	let nextLeadingSpace = false;
	// DTW gives one accurate time per token; a token spans previous DTW time -> its own.
	const useDtw = tokens.some(
		(token) => {
			const dtw = (token as WhisperJsonToken)?.t_dtw;
			return isFiniteNumber(dtw) && dtw >= 0;
		},
	);
	let previousDtwMs: number | null = null;

	for (const token of tokens) {
		if (!token || typeof token !== "object") {
			continue;
		}

		const tokenData = token as WhisperJsonToken;
		const tokenText = typeof tokenData.text === "string" ? tokenData.text : "";
		if (!tokenText || /^\[_[^\]]+\]$/.test(tokenText)) {
			continue;
		}

		let tokenStartMs = isFiniteNumber(tokenData.offsets?.from)
			? Math.round(tokenData.offsets.from)
			: null;
		let tokenEndMs = isFiniteNumber(tokenData.offsets?.to)
			? Math.round(tokenData.offsets.to)
			: null;
		if (useDtw && isFiniteNumber(tokenData.t_dtw) && tokenData.t_dtw >= 0) {
			const dtwMs = Math.round(tokenData.t_dtw * 10);
			tokenStartMs = Math.min(previousDtwMs ?? tokenStartMs ?? dtwMs, dtwMs);
			tokenEndMs = dtwMs;
			previousDtwMs = dtwMs;
		}
		// ASCII whitespace only: in raw-byte mode UTF-8 continuation bytes look like NBSP.
		const parts = tokenText.match(/[ \t\r\n]+|[^ \t\r\n]+/g) ?? [];

		for (const part of parts) {
			if (/^[ \t\r\n]+$/.test(part)) {
				nextLeadingSpace = words.length > 0;
				continue;
			}

			const previousWord = words.length > 0 ? words[words.length - 1] : null;
			if (previousWord && !nextLeadingSpace && /^\p{P}+$/u.test(decode(part))) {
				previousWord.text += part;
				continue;
			}
			// Zero-length tokens are common (short fillers like "음"); only reversed spans are bad.
			if (tokenStartMs == null || tokenEndMs == null || tokenEndMs < tokenStartMs) return [];

			if (!previousWord || nextLeadingSpace) {
				words.push({
					text: part,
					startMs: tokenStartMs,
					endMs: tokenEndMs,
					...(words.length > 0 && nextLeadingSpace ? { leadingSpace: true } : {}),
				});
			} else {
				previousWord.text += part;
				previousWord.endMs = Math.max(previousWord.endMs, tokenEndMs);
			}

			nextLeadingSpace = false;
		}
	}

	return words
		.map((word) => (rawBytes ? { ...word, text: decode(word.text) } : word))
		.filter((word) => word.text.trim().length > 0);
}

export function parseWhisperJsonCues(content: string, rawBytes = false): CaptionCuePayload[] {
	try {
		const parsed = JSON.parse(content) as {
			transcription?: unknown;
		};

		if (!Array.isArray(parsed.transcription)) {
			return [];
		}

		return parsed.transcription
			.map((segment, index) => {
				if (!segment || typeof segment !== "object") {
					return null;
				}

				const segmentData = segment as WhisperJsonSegment;
				const startMs = isFiniteNumber(segmentData.offsets?.from)
					? Math.round(segmentData.offsets.from)
					: null;
				const endMs = isFiniteNumber(segmentData.offsets?.to)
					? Math.round(segmentData.offsets.to)
					: null;
				const segmentText =
					typeof segmentData.text === "string"
						? (rawBytes ? decodeRaw(segmentData.text) : segmentData.text).trim()
						: "";

				if (startMs == null || endMs == null || endMs <= startMs) {
					return null;
				}

				const words = parseWhisperJsonWords(segmentData.tokens, rawBytes);
				const text = words.length > 0 ? buildCaptionTextFromWords(words) : segmentText;

				if (!text) {
					return null;
				}

				return {
					id: `caption-${index + 1}`,
					startMs,
					endMs,
					text,
					...(words.length > 0 ? { words } : {}),
				};
			})
			.filter((cue): cue is CaptionCuePayload => cue != null);
	} catch (error) {
		console.warn("[auto-captions] Failed to parse Whisper JSON output:", error);
		return [];
	}
}

export function parseSrtTimestamp(value: string): number | null {
	const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
	if (!match) {
		return null;
	}

	const [, hours, minutes, seconds, milliseconds] = match;
	return (
		Number(hours) * 60 * 60 * 1000 +
		Number(minutes) * 60 * 1000 +
		Number(seconds) * 1000 +
		Number(milliseconds)
	);
}

export function parseSrtCues(content: string): CaptionCuePayload[] {
	return content
		.split(/\r?\n\r?\n/)
		.map((block, index) => {
			const lines = block.split(/\r?\n/).map((line) => line.trim());
			const timingLine = lines.find((line) => line.includes("-->"));
			if (!timingLine) {
				return null;
			}

			const [rawStart, rawEnd] = timingLine.split("-->").map((part) => part.trim());
			const startMs = parseSrtTimestamp(rawStart);
			const endMs = parseSrtTimestamp(rawEnd);
			if (startMs == null || endMs == null || endMs <= startMs) {
				return null;
			}

			const text = lines
				.slice(lines.indexOf(timingLine) + 1)
				.filter((line) => line.length > 0)
				.join("\n")
				.trim();

			if (!text) {
				return null;
			}

			return {
				id: `caption-${index + 1}`,
				startMs,
				endMs,
				text,
			};
		})
		.filter((cue): cue is CaptionCuePayload => cue != null);
}

export function shouldRetryWhisperWithoutJson(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /(?:unknown|unrecognized|unsupported) (?:argument|option)[:\s=]+['"]?--?(?:ojf|output-json-full)\b/i.test(
		message,
	);
}

/** whisper.cpp `--dtw` preset for a stock ggml model file, or null (custom models). */
export function whisperDtwPreset(modelPath: string): string | null {
	const match = modelPath
		.split(/[\\/]/)
		.pop()
		?.match(/^ggml-(tiny|base|small|medium|large-v[123](?:-turbo)?)(\.en)?(?:-q\w+)?\.bin$/i);
	if (!match) return null;
	return `${match[1].toLowerCase().replace(/-/g, ".")}${match[2] ?? ""}`;
}
