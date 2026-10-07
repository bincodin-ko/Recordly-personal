import type { ClipSequenceSpan } from "../timeline/core/timelineTypes";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { changeClipSpan } from "../clipSpanChange";
import {
	packClipSequence,
	reorderClipSequence,
	rippleRegionAnchors,
	rippleRegions,
} from "../clipSequence";
import { getClipSourceStartMs, type AnnotationRegion, type AudioRegion } from "../types";
import { planClipSplit } from "../clipSplit";
import { restoreTrimGap, type TrimGap } from "../trimRestore";
import { applySpeedToSourceRanges, rippleBySource, type SourceSpeedRange } from "../typingSpeedUp";
import type { ClipRegion, EditorEffectSection, ZoomRegion } from "../types";
import { supportsPreviewPlaybackRate } from "../videoPlayback/playbackRate";

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseClipRegionCommandsParams {
	setAnnotationRegions: Dispatch<SetStateAction<AnnotationRegion[]>>;
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	sourceDurationMs: number;
	clipRegions: ClipRegion[];
	setClipRegions: Dispatch<SetStateAction<ClipRegion[]>>;
	zoomRegions: ZoomRegion[];
	setZoomRegions: Dispatch<SetStateAction<ZoomRegion[]>>;
	selectedClipId: string | null;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextClipIdRef: MutableRefObject<number>;
	t: Translator;
}

export function useClipRegionCommands({
	setAnnotationRegions,
	setAudioRegions,
	sourceDurationMs,
	clipRegions,
	setClipRegions,
	zoomRegions,
	setZoomRegions,
	selectedClipId,
	setSelectedClipId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextClipIdRef,
	t,
}: UseClipRegionCommandsParams) {
	const applySequence = useCallback(
		(edited: ClipRegion[]) => {
			const next = packClipSequence(edited);
			setClipRegions(next);
			setZoomRegions((current) => rippleRegions(current, clipRegions, next));
			setAnnotationRegions((current) => rippleRegions(current, clipRegions, next));
			setAudioRegions((current) => rippleRegionAnchors(current, clipRegions, next));
		},
		[clipRegions, setClipRegions, setZoomRegions, setAnnotationRegions, setAudioRegions],
	);

	const handleSelectClip = useCallback(
		(id: string | null) => {
			setSelectedClipId(id);
			if (id) {
				setActiveEffectSection("clip");
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedAudioId(null);
				setSelectedCaptionId(null);
			} else {
				setActiveEffectSection((section) => (section === "clip" ? "scene" : section));
			}
		},
		[
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedClipId,
			setSelectedZoomId,
		],
	);

	const handleClipSplit = useCallback(
		(splitMs: number) => {
			const plan = planClipSplit({
				clipRegions,
				splitMs,
				createId: () => `clip-${nextClipIdRef.current++}`,
			});
			if (!plan) return;
			setClipRegions((current) =>
				current.flatMap((clip) =>
					clip.id === plan.targetId ? [plan.left, plan.right] : [clip],
				),
			);
			if (selectedClipId === plan.targetId) setSelectedClipId(plan.left.id);
		},
		[clipRegions, nextClipIdRef, selectedClipId, setClipRegions, setSelectedClipId],
	);

	const handleClipSpanChange = useCallback(
		(id: string, span: ClipSequenceSpan) => {
			const oldClip = clipRegions.find((clip) => clip.id === id);
			const newStart = Math.round(span.start);
			const newEnd = Math.round(span.end);

			if (!oldClip) return;
			if (span.sequenceIndex !== undefined) {
				applySequence(reorderClipSequence(clipRegions, id, span.sequenceIndex));
				return;
			}
			applySequence(
				clipRegions.map((clip) =>
					clip.id === id
						? changeClipSpan(clip, newStart, newEnd, sourceDurationMs)
						: clip,
				),
			);
		},
		[clipRegions, applySequence, sourceDurationMs],
	);

	const setClipSpeedById = useCallback(
		(id: string, speed: number) => {
			if (!Number.isFinite(speed) || speed <= 0) return;
			if (!supportsPreviewPlaybackRate(speed)) {
				toast.error(
					t(
						"editor.timeline.unsupportedSpeed",
						"This speed is not supported for preview on this device.",
					),
				);
				return;
			}

			applySequence(
				clipRegions.map((clip) =>
					clip.id === id
						? {
								...clip,
								sourceStartMs: getClipSourceStartMs(clip),
								speed,
								endMs:
									clip.startMs +
									Math.max(
										1,
										Math.round(
											((clip.endMs - clip.startMs) * clip.speed) / speed,
										),
									),
							}
						: clip,
				),
			);
		},
		[clipRegions, applySequence, t],
	);
	const handleClipSpeedChange = useCallback(
		(speed: number) => {
			if (selectedClipId) setClipSpeedById(selectedClipId, speed);
		},
		[selectedClipId, setClipSpeedById],
	);

	/** Screen Studio "Set volume": 0..1 for one clip (split the clip first for a sub-range). */
	const setClipVolumeById = useCallback(
		(id: string, volume: number) => {
			const next = Math.max(0, Math.min(1, volume));
			setClipRegions((current) =>
				current.map((clip) => {
					if (clip.id !== id) return clip;
					const { volume: _old, ...rest } = clip;
					return next >= 1 ? rest : { ...rest, volume: next };
				}),
			);
		},
		[setClipRegions],
	);
	const handleClipVolumeChange = useCallback(
		(volume: number) => {
			if (selectedClipId) setClipVolumeById(selectedClipId, volume);
		},
		[selectedClipId, setClipVolumeById],
	);

	/** Screen Studio "Apply suggestion(s)": speed up source-time ranges (typing bursts). */
	const handleApplySpeedRanges = useCallback(
		(ranges: SourceSpeedRange[]) => {
			if (ranges.length === 0) return;
			if (ranges.some((range) => !supportsPreviewPlaybackRate(range.speed))) {
				toast.error(
					t(
						"editor.timeline.unsupportedSpeed",
						"This speed is not supported for preview on this device.",
					),
				);
				return;
			}
			const next = applySpeedToSourceRanges(
				clipRegions,
				ranges,
				() => `clip-${nextClipIdRef.current++}`,
			);
			setClipRegions(next);
			setZoomRegions((current) => rippleBySource(current, clipRegions, next));
			setAnnotationRegions((current) => rippleBySource(current, clipRegions, next));
			setAudioRegions((current) =>
				current.map((region) => {
					const [moved] = rippleBySource(
						[{ startMs: region.startMs, endMs: region.startMs + 1 }],
						clipRegions,
						next,
					);
					const startMs = moved?.startMs ?? region.startMs;
					return { ...region, startMs, endMs: startMs + region.endMs - region.startMs };
				}),
			);
		},
		[
			clipRegions,
			nextClipIdRef,
			setClipRegions,
			setZoomRegions,
			setAnnotationRegions,
			setAudioRegions,
			t,
		],
	);

	/** Undo a trim: bring the gap back, inheriting the chosen neighbour's effects. */
	const handleRestoreTrim = useCallback(
		(gap: TrimGap, side: "before" | "after" | null) => {
			const result = restoreTrimGap({
				gap,
				clips: clipRegions,
				zooms: zoomRegions,
				side,
				createId: () => `clip-${nextClipIdRef.current++}`,
			});
			setClipRegions(result.clips);
			setZoomRegions(result.zooms);
			setAnnotationRegions((current) => rippleBySource(current, clipRegions, result.clips));
		},
		[
			clipRegions,
			zoomRegions,
			nextClipIdRef,
			setClipRegions,
			setZoomRegions,
			setAnnotationRegions,
		],
	);

	const handleClipMutedChange = useCallback(
		(muted: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => (clip.id === selectedClipId ? { ...clip, muted } : clip)),
			);
		},
		[selectedClipId, setClipRegions],
	);
	const handleClipHideCursorChange = useCallback(
		(hideCursor: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => (clip.id === selectedClipId ? { ...clip, hideCursor } : clip)),
			);
		},
		[selectedClipId, setClipRegions],
	);
	const handleClipShowSourceAudioChange = useCallback(
		(showSourceAudio: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) =>
					clip.id === selectedClipId ? { ...clip, showSourceAudio } : clip,
				),
			);
		},
		[selectedClipId, setClipRegions],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			applySequence(clipRegions.filter((clip) => clip.id !== id));
			if (selectedClipId === id) setSelectedClipId(null);
		},
		[clipRegions, selectedClipId, applySequence, setSelectedClipId],
	);

	return {
		handleSelectClip,
		handleClipSplit,
		handleClipSpanChange,
		handleClipSpeedChange,
		setClipSpeedById,
		handleClipVolumeChange,
		setClipVolumeById,
		handleApplySpeedRanges,
		handleRestoreTrim,
		handleClipMutedChange,
		handleClipHideCursorChange,
		handleClipShowSourceAudioChange,
		handleClipDelete,
	};
}
