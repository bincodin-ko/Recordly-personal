import { describe, expect, it } from "vitest";
import {
	buildDuckCurve,
	computeSpeechGate,
	DUCK_GAIN,
	normalizeAudioExtras,
	sampleDuckCurve,
} from "./audioExtras";

function speechInSilence(sampleRate: number) {
	// 0-2 s quiet noise, 2-4 s loud tone ("speech"), 4-6 s quiet noise.
	const data = new Float32Array(sampleRate * 6);
	for (let i = 0; i < data.length; i++) {
		const t = i / sampleRate;
		data[i] = t >= 2 && t < 4 ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : (Math.random() - 0.5) * 0.002;
	}
	return data;
}

describe("audioExtras", () => {
	it("normalizes bad input to defaults", () => {
		expect(normalizeAudioExtras({ micMode: "x", music: { volume: 9 } })).toEqual({
			micMode: "standard",
			music: { path: null, volume: 1, ducking: true },
		});
	});

	it("ducks music under speech and restores it afterwards", () => {
		const sampleRate = 8000;
		const gate = computeSpeechGate([speechInSilence(sampleRate)], sampleRate);
		const curve = buildDuckCurve(gate, [{ sourceStartMs: 0, sourceEndMs: 6000, speed: 1 }], 6000);
		expect(sampleDuckCurve(curve, 1)).toBeGreaterThan(0.95);
		expect(sampleDuckCurve(curve, 3)).toBeCloseTo(DUCK_GAIN, 2);
		expect(sampleDuckCurve(curve, 4.2)).toBeLessThan(0.5); // hold + release
		// The fade-out starts 1.5 s before the end, so check just before it.
		expect(sampleDuckCurve(curve, 5.6)).toBeLessThan(1);
		expect(sampleDuckCurve(curve, 4.45)).toBeGreaterThan(sampleDuckCurve(curve, 4.2));
	});

	it("maps output time through cut/sped-up clips", () => {
		const sampleRate = 8000;
		const gate = computeSpeechGate([speechInSilence(sampleRate)], sampleRate);
		// Output 0-1 s = source 0-1 s, output 1-3 s = source 2-4 s (speech).
		const curve = buildDuckCurve(
			gate,
			[
				{ outputStartMs: 0, sourceStartMs: 0, sourceEndMs: 1000, speed: 1 },
				{ outputStartMs: 1000, sourceStartMs: 2000, sourceEndMs: 4000, speed: 1 },
			],
			3000,
		);
		expect(sampleDuckCurve(curve, 0.7)).toBeGreaterThan(0.95);
		expect(sampleDuckCurve(curve, 1.4)).toBeCloseTo(DUCK_GAIN, 2);
	});
});
