import { describe, expect, it } from "vitest";
import { type EditorCommand, filterCommands } from "./CommandMenu";

const make = (id: string, label: string, keywords?: string): EditorCommand => ({
	id,
	label,
	keywords,
	run: () => undefined,
});

describe("filterCommands", () => {
	const commands = [make("zoom", "줌 추가", "add zoom"), make("split", "클립 나누기", "split trim")];
	it("matches label or english keywords, all tokens", () => {
		expect(filterCommands(commands, "줌").map((c) => c.id)).toEqual(["zoom"]);
		expect(filterCommands(commands, "TRIM").map((c) => c.id)).toEqual(["split"]);
		expect(filterCommands(commands, "add trim")).toEqual([]);
	});
	it("returns everything for an empty query", () => {
		expect(filterCommands(commands, "  ")).toHaveLength(2);
	});
});
