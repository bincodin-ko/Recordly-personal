import { describe, expect, it, vi } from "vitest";
import { getQuitBusy, quitDialogOptions, shouldAllowQuit } from "./quitGuard";

describe("quitGuard", () => {
	it("recording wins over exporting", () => {
		expect(getQuitBusy({ recording: true, exporting: true })).toBe("recording");
		expect(getQuitBusy({ recording: false, exporting: true })).toBe("exporting");
		expect(getQuitBusy({ recording: false, exporting: false })).toBeNull();
	});
	it("does not ask when idle or already confirmed", () => {
		const ask = vi.fn(() => 1);
		expect(shouldAllowQuit(null, false, ask)).toBe(true);
		expect(shouldAllowQuit("recording", true, ask)).toBe(true);
		expect(ask).not.toHaveBeenCalled();
	});
	it("asks when busy: 끄기 allows, 취소 blocks", () => {
		expect(shouldAllowQuit("recording", false, () => 0)).toBe(true);
		expect(shouldAllowQuit("exporting", false, () => 1)).toBe(false);
	});
	it("uses the Korean messages", () => {
		expect(quitDialogOptions("recording").message).toBe("녹화 중입니다. 정말 끌까요?");
		expect(quitDialogOptions("exporting").buttons).toEqual(["끄기", "취소"]);
	});
});
