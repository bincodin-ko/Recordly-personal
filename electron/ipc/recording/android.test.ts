import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "", getAppPath: () => "" } }));
vi.mock("../ffmpeg/binary", () => ({ getFfmpegBinaryPath: () => "ffmpeg" }));

import { parseAdbDevices } from "./android";

describe("parseAdbDevices", () => {
	it("keeps authorized devices with model names and skips unauthorized/offline", () => {
		const out = [
			"List of devices attached",
			"R5CW1234ABC            device usb:1-1 product:dm3qksx model:SM_S918N device:dm3q transport_id:1",
			"ZY22ABCD               unauthorized usb:1-2 transport_id:2",
			"emulator-5554          offline",
			"",
		].join("\r\n");
		expect(parseAdbDevices(out)).toEqual([{ serial: "R5CW1234ABC", model: "SM S918N" }]);
	});
});
