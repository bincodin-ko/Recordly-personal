import { describe, expect, it } from "vitest";
import { findFreeAnnotationTrack, layoutAnnotationTracks } from "./annotationTracks";

describe("layoutAnnotationTracks", () => {
	it("stacks overlapping annotations stored on the same track", () => {
		const map = layoutAnnotationTracks([
			{ id: "a", startMs: 0, endMs: 1000 },
			{ id: "b", startMs: 500, endMs: 1500 },
			{ id: "c", startMs: 600, endMs: 700 },
		]);
		expect([map.get("a"), map.get("b"), map.get("c")]).toEqual([0, 1, 2]);
	});
	it("keeps non-overlapping annotations and stored tracks", () => {
		const map = layoutAnnotationTracks([
			{ id: "a", startMs: 0, endMs: 1000 },
			{ id: "b", startMs: 1000, endMs: 2000 },
			{ id: "c", startMs: 0, endMs: 500, trackIndex: 3 },
		]);
		expect([map.get("a"), map.get("b"), map.get("c")]).toEqual([0, 0, 3]);
	});
	it("finds a free track for a new span", () => {
		const regions = [{ id: "a", startMs: 0, endMs: 1000 }];
		expect(findFreeAnnotationTrack(regions, 200, 800)).toBe(1);
		expect(findFreeAnnotationTrack(regions, 1000, 2000)).toBe(0);
	});
});
