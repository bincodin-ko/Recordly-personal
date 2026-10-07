import { describe, expect, it } from "vitest";
import { parseCssGradient, renderCssGradientPixels } from "./cssGradient";

function render(value: string, w: number, h: number, dither = true) {
	const parsed = parseCssGradient(value);
	if (!parsed) throw new Error(`unparsed: ${value}`);
	const out = new Uint8ClampedArray(w * h * 4);
	renderCssGradientPixels(parsed, out, w, h, dither);
	return out;
}

describe("cssGradient", () => {
	it("parses angle, rgba stops with positions and radial position", () => {
		const linear = parseCssGradient(
			"linear-gradient( 111.6deg,  rgba(114,167,232,1) 9.4%, rgba(253,129,82,1) 43.9%, #f9ca56 86.3% )",
		);
		expect(linear?.type).toBe("linear");
		expect(linear?.stops.map((s) => s.pos)).toEqual([0.094, 0.439, 0.863]);
		expect(linear?.stops[2].color).toEqual([249, 202, 86, 1]);
		const radial = parseCssGradient(
			"radial-gradient( circle farthest-corner at 10% 20%,  rgba(2,37,78,1) 0%, rgba(85,245,221,1) 100.2% )",
		);
		expect(radial).toMatchObject({
			type: "radial",
			circle: true,
			at: [{ frac: 0.1 }, { frac: 0.2 }],
		});
		expect(parseCssGradient("#ff0000")).toBeNull();
	});

	it("follows CSS direction: 'to right' runs left to right, 90deg equals it", () => {
		const a = render("linear-gradient(to right, #000000, #ffffff)", 64, 2, false);
		const b = render("linear-gradient(90deg, #000000, #ffffff)", 64, 2, false);
		expect(a).toEqual(b);
		expect(a[0]).toBeLessThan(5);
		expect(a[63 * 4]).toBeGreaterThan(250);
	});

	it("dither keeps the column mean on the ideal ramp and breaks up flat runs", () => {
		const w = 1024;
		const h = 64;
		const value = "linear-gradient(to right, #202838 0%, #303848 100%)";
		const plain = render(value, w, h, false);
		const dithered = render(value, w, h);
		let maxErr = 0;
		let longestPlain = 0;
		let longestDithered = 0;
		let runP = 0;
		let runD = 0;
		for (let x = 0; x < w; x++) {
			let sum = 0;
			for (let y = 0; y < h; y++) sum += dithered[(y * w + x) * 4];
			const ideal = 0x20 + (16 * (x + 0.5)) / w;
			maxErr = Math.max(maxErr, Math.abs(sum / h - ideal));
			if (x > 0) {
				runP = plain[x * 4] === plain[(x - 1) * 4] ? runP + 1 : 1;
				runD = dithered[x * 4] === dithered[(x - 1) * 4] ? runD + 1 : 1;
				longestPlain = Math.max(longestPlain, runP);
				longestDithered = Math.max(longestDithered, runD);
			}
		}
		expect(maxErr).toBeLessThan(0.2);
		expect(longestPlain).toBeGreaterThan(50);
		expect(longestDithered).toBeLessThan(12);
	});
});
