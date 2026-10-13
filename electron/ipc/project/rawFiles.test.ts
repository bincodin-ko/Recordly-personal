import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRawFilePlan } from "./rawFiles";

describe("buildRawFilePlan", () => {
	it("lists screen, camera and audio sidecars, skipping missing or empty ones", async () => {
		const sizes: Record<string, number> = {
			"/r/rec.mp4": 10,
			"/r/rec-webcam.mp4": 5,
			"/r/rec.mic.wav": 3,
			"/r/rec.system.wav": 0,
		};
		const plan = await buildRawFilePlan({
			videoPath: "/r/rec.mp4",
			webcamPath: "/r/rec-webcam.mp4",
			destDir: "/out",
			companions: [
				{ kind: "system", src: "/r/rec.system.wav" },
				{ kind: "microphone", src: "/r/rec.mic.wav" },
				{ kind: "microphone", src: "/r/rec.mic.m4a" },
			],
			sizeOf: async (file) => sizes[file] ?? Promise.reject(new Error("missing")),
		});
		expect(plan.map((item) => [item.kind, item.dest])).toEqual([
			["screen", path.join("/out", "rec.mp4")],
			["camera", path.join("/out", "rec-webcam.mp4")],
			["microphone", path.join("/out", "rec.mic.wav")],
		]);
	});

	it("omits the camera when the recording has none", async () => {
		const plan = await buildRawFilePlan({
			videoPath: "/r/a.mp4",
			destDir: "/o",
			companions: [],
			sizeOf: async () => 1,
		});
		expect(plan).toHaveLength(1);
	});
});
