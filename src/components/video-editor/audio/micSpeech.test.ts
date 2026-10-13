import { describe, expect, it } from "vitest";
import { loadPlayhead, savePlayhead } from "../hooks/playheadMemory";
import {
	frameLevelsDb,
	markFreshRecordingForMicCheck,
	shouldAutoMuteMic,
	takeFreshRecordingMicCheck,
} from "./micSpeech";

const RATE = 16000;
function tone(seconds: number, amplitude: number) {
	const out = new Float32Array(Math.round(seconds * RATE));
	for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE);
	return out;
}

describe("auto mute microphone", () => {
	it("mutes a mic that only caught room noise", () => {
		expect(shouldAutoMuteMic(frameLevelsDb(tone(3, 0.001), RATE))).toBe(true);
	});
	it("keeps a mic with speech-level audio", () => {
		const samples = tone(3, 0.001);
		samples.set(tone(1, 0.2), RATE); // one loud second in the middle
		expect(shouldAutoMuteMic(frameLevelsDb(samples, RATE))).toBe(false);
	});
	it("never mutes when detection failed or there is no audio", () => {
		expect(shouldAutoMuteMic(null)).toBe(false);
		expect(shouldAutoMuteMic([])).toBe(false);
	});
	it("checks a fresh recording only once", () => {
		markFreshRecordingForMicCheck("a.mp4");
		expect(takeFreshRecordingMicCheck("b.mp4")).toBe(false);
		expect(takeFreshRecordingMicCheck("a.mp4")).toBe(true);
		expect(takeFreshRecordingMicCheck("a.mp4")).toBe(false);
	});
});

describe("playhead memory", () => {
	const store = new Map<string, string>();
	const storage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
	};
	it("restores the saved playhead for the same recording", () => {
		savePlayhead(storage, "rec1", 12.5);
		expect(loadPlayhead(storage, "rec1", 60)).toBe(12.5);
		expect(loadPlayhead(storage, "other", 60)).toBeNull();
	});
	it("ignores a playhead outside the (possibly trimmed) timeline", () => {
		savePlayhead(storage, "rec2", 50);
		expect(loadPlayhead(storage, "rec2", 30)).toBeNull();
		savePlayhead(storage, "rec3", 0);
		expect(loadPlayhead(storage, "rec3", 30)).toBeNull();
	});
	it("survives blocked storage", () => {
		const broken = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
		};
		expect(() => savePlayhead(broken, "x", 1)).not.toThrow();
		expect(loadPlayhead(broken, "x", 10)).toBeNull();
	});
});
