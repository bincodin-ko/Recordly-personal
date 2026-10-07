import { describe, expect, it } from "vitest";
import {
	applyLutToPixel,
	COLOR_LOOKS,
	cubeToStoredLut,
	getLookLut,
	normalizeColorGrading,
	parseCubeLut,
} from "./colorGrading";

function cube(size: number, f: (r: number, g: number, b: number) => number[]): string {
	const lines = ['TITLE "test"', `LUT_3D_SIZE ${size}`];
	for (let b = 0; b < size; b++)
		for (let g = 0; g < size; g++)
			for (let r = 0; r < size; r++)
				lines.push(
					f(r / (size - 1), g / (size - 1), b / (size - 1))
						.map((v) => v.toFixed(6))
						.join(" "),
				);
	return lines.join("\n");
}

describe("colorGrading", () => {
	it("parses a .cube and an identity LUT keeps colors", () => {
		const stored = cubeToStoredLut(
			"id",
			cube(17, (r, g, b) => [r, g, b]),
		);
		const lut = getLookLut({ look: "custom", intensity: 1, lut: stored })!;
		for (const px of [
			[0, 0, 0],
			[255, 255, 255],
			[200, 30, 90],
			[17, 128, 240],
		]) {
			const out = applyLutToPixel(lut, px[0], px[1], px[2]);
			out.forEach((v, i) => expect(Math.abs(v - px[i])).toBeLessThanOrEqual(1));
		}
	});

	it("keeps channel order (red fastest) for a swap LUT", () => {
		const stored = cubeToStoredLut(
			"swap",
			cube(9, (r, g, b) => [b, g, r]),
		);
		const lut = getLookLut({ look: "custom", intensity: 1, lut: stored })!;
		const [r, , b] = applyLutToPixel(lut, 255, 0, 0);
		expect(r).toBeLessThan(2);
		expect(b).toBeGreaterThan(253);
	});

	it("rejects malformed files", () => {
		expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n")).toThrow(/Expected 8/);
		expect(() => parseCubeLut("0 0 0")).toThrow(/LUT_3D_SIZE/);
		expect(() => parseCubeLut("LUT_1D_SIZE 4")).toThrow(/1D/);
	});

	it("has 12 presets; B&W outputs gray", () => {
		expect(COLOR_LOOKS).toHaveLength(12);
		const [r, g, b] = applyLutToPixel(getLookLut({ look: "bw", intensity: 1 })!, 220, 40, 60);
		expect(Math.abs(r - g)).toBeLessThan(2);
		expect(Math.abs(g - b)).toBeLessThan(2);
	});

	it("normalizes unknown values to off", () => {
		const n = normalizeColorGrading({
			screen: { look: "nope", intensity: 5 },
			cameraSharpness: -1,
		});
		expect(n.screen).toEqual({ look: "none", intensity: 1, lut: null });
		expect(n.cameraSharpness).toBe(0);
	});
});
