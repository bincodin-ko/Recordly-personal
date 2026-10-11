import { describe, expect, it } from "vitest";
import { nextPrompterPlaying } from "./prompterAutoFlow";

describe("nextPrompterPlaying", () => {
	it("starts when recording starts and stops when it stops", () => {
		expect(nextPrompterPlaying(false, true, true)).toBe(true);
		expect(nextPrompterPlaying(true, false, true)).toBe(false);
	});
	it("does nothing when auto-flow is off", () => {
		expect(nextPrompterPlaying(false, true, false)).toBe(false);
		expect(nextPrompterPlaying(true, false, false)).toBe(true);
	});
});
