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
import { mergeAllSplits, mergeSplit, restoreTrimGap, type SplitPoint, type TrimGap } from "../trimRestore";
import { applySpeedToSourceRanges, rippleBySource, type SourceSpeedRange } from "../typingSpeedUp";
import { cutSourceRanges, type SourceRange } from "../transcriptEdit";
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
	nextAudioIdRef: MutableRefObject<number>;
	/** Local path of the recording the clips read from. */
	sourcePath: string | null;
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
	nextAudioIdRef,
	sourcePath,
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

	/** Undo several trims that need no effect choice, in one state update. */
	const handleRestoreTrims = useCallback(
		(gaps: TrimGap[]) => {
			let clips = clipRegions;
			let zooms = zoomRegions;
			for (const gap of gaps) {
				const result = restoreTrimGap({
					gap,
					clips,
					zooms,
					side: null,
					createId: () => `clip-${nextClipIdRef.current++}`,
				});
				clips = result.clips;
				zooms = result.zooms;
			}
			// Scissors cuts go too: the recording ends up as whole clips again.
			clips = mergeAllSplits(clips);
			if (selectedClipId && !clips.some((clip) => clip.id === selectedClipId)) {
				setSelectedClipId(null);
			}
			setClipRegions(clips);
			setZoomRegions(zooms);
			setAnnotationRegions((current) => rippleBySource(current, clipRegions, clips));
		},
		[
			clipRegions,
			zoomRegions,
			nextClipIdRef,
			selectedClipId,
			setSelectedClipId,
			setClipRegions,
			setZoomRegions,
			setAnnotationRegions,
		],
	);

	/** Undo a scissors cut. Timeline positions don't move, so nothing else ripples. */
	const handleMergeSplit = useCallback(
		(point: Pick<SplitPoint, "leftClipId" | "rightClipId">) => {
			setClipRegions((current) => mergeSplit(current, point));
			if (selectedClipId === point.rightClipId) setSelectedClipId(point.leftClipId);
		},
		[selectedClipId, setClipRegions, setSelectedClipId],
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
	const handleClipDisableSmoothCursorChange = useCallback(
		(disableSmoothCursor: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) =>
					clip.id === selectedClipId ? { ...clip, disableSmoothCursor } : clip,
				),
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

	/** Screen Studio "separate audio": the clip's original sound becomes its own audio track. */
	const handleClipSeparateAudio = useCallback(
		async (clipId: string | null = selectedClipId) => {
			const clip = clipRegions.find((value) => value.id === clipId);
			if (!clip || !sourcePath) return;
			const sourceStartMs = getClipSourceStartMs(clip);
			const result = await window.electronAPI.extractClipAudio({
				videoPath: sourcePath,
				startMs: sourceStartMs,
				endMs: sourceStartMs + (clip.endMs - clip.startMs) * clip.speed,
				speed: clip.speed,
			});
			if (!result.success || !result.path) {
				toast.error(
					result.error === "no audio"
						? t("editor.audio.separateNoAudio", "This clip has no original audio to separate.")
						: t("editor.audio.separateFailed", "Could not separate the audio."),
				);
				return;
			}
			const id = `audio-${nextAudioIdRef.current++}`;
			const audioPath = result.path;
			setAudioRegions((current) => [
				...current,
				{
					id,
					startMs: clip.startMs,
					endMs: clip.endMs,
					audioPath,
					volume: 1,
					normalize: false,
					trackIndex:
						current.length > 0
							? Math.max(...current.map((region) => region.trackIndex ?? 0)) + 1
							: 0,
				},
			]);
			setClipRegions((current) =>
				current.map((value) => (value.id === clip.id ? { ...value, muted: true } : value)),
			);
			setSelectedClipId(null);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedCaptionId(null);
			setSelectedAudioId(id);
			setActiveEffectSection("audio");
			toast.success(t("editor.audio.separated", "Original audio separated into its own track."));
		},
		[
			clipRegions,
			selectedClipId,
			sourcePath,
			nextAudioIdRef,
			setAudioRegions,
			setClipRegions,
			setSelectedClipId,
			setSelectedZoomId,
			setSelectedAnnotationId,
			setSelectedCaptionId,
			setSelectedAudioId,
			setActiveEffectSection,
			t,
		],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			applySequence(clipRegions.filter((clip) => clip.id !== id));
			if (selectedClipId === id) setSelectedClipId(null);
		},
		[clipRegions, selectedClipId, applySequence, setSelectedClipId],
	);

	/** Edit by transcript: cut source-time ranges (words, fillers, pauses) out of the sequence. */
	const handleCutSourceRanges = useCallback(
		(ranges: SourceRange[]) => {
			const base =
				clipRegions.length > 0
					? clipRegions
					: [{ id: "clip-base", startMs: 0, endMs: Math.round(sourceDurationMs), speed: 1 }];
			const before = cutSourceRanges(base, ranges, () => `clip-${nextClipIdRef.current++}`);
			if (!before) return false;
			const next = packClipSequence(before);
			setClipRegions(next);
			setZoomRegions((current) => rippleRegions(current, before, next));
			setAnnotationRegions((current) => rippleRegions(current, before, next));
			setAudioRegions((current) => rippleRegionAnchors(current, before, next));
			if (selectedClipId && !next.some((clip) => clip.id === selectedClipId)) {
				setSelectedClipId(null);
			}
			return true;
		},
		[
			clipRegions,
			sourceDurationMs,
			nextClipIdRef,
			selectedClipId,
			setClipRegions,
			setZoomRegions,
			setAnnotationRegions,
			setAudioRegions,
			setSelectedClipId,
		],
	);

	return {
		handleCutSourceRanges,
		handleSelectClip,
		handleClipSplit,
		handleClipSpanChange,
		handleClipSpeedChange,
		setClipSpeedById,
		handleClipVolumeChange,
		setClipVolumeById,
		handleApplySpeedRanges,
		handleRestoreTrim,
		handleRestoreTrims,
		handleMergeSplit,
		handleClipMutedChange,
		handleClipHideCursorChange,
		handleClipDisableSmoothCursorChange,
		handleClipShowSourceAudioChange,
		handleClipSeparateAudio,
		handleClipDelete,
	};
}
