import type { Dispatch, SetStateAction } from "react";
import type { WebcamOverlaySettings } from "../types";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildShortcutBlocks, type CursorExtrasSettings } from "../cursorExtras";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import { retimeCaptionFragment } from "../captionTimeline";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useAudioRegionCommands } from "../hooks/useAudioRegionCommands";
import type { useCaptionCommands } from "../hooks/useCaptionCommands";
import type { useClipRegionCommands } from "../hooks/useClipRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useTimelineState } from "../state/useTimelineState";
import { ClipActionsProvider } from "../timeline/core/ClipActionsContext";
import { useClipTimelineActions } from "../timeline/clipOverlays/useClipTimelineActions";
import TimelineEditor, { type TimelineEditorHandle } from "../timeline/TimelineEditor";

type Props = {
	panelRef?: RefObject<HTMLDivElement | null>;
	timelineRef: RefObject<TimelineEditorHandle | null>;
	timeline: ReturnType<typeof useTimelineState>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	clipCommands: ReturnType<typeof useClipRegionCommands>;
	audioCommands: ReturnType<typeof useAudioRegionCommands>;
	captionCommands: ReturnType<typeof useCaptionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	videoPath: string | null;
	videoSourcePath: string | null;
	cursorTelemetrySourcePath: string | null;
	normalizedCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	autoSuggestZoomsTrigger: number;
	handleAutoSuggestZoomsConsumed: () => void;
	disableSuggestedZooms: boolean;
	currentTime: number;
	isPlaying: boolean;
	handleSelectAnnotation: (id: string | null) => void;
	cursorExtras: CursorExtrasSettings;
	sourceDurationMs: number;
	webcam: WebcamOverlaySettings;
	setWebcam: Dispatch<SetStateAction<WebcamOverlaySettings>>;
};

export function EditorTimelinePanel(props: Props) {
	const {
		timelineRef,
		timeline,
		projection,
		playback,
		audio,
		zoomCommands,
		clipCommands,
		audioCommands,
		captionCommands,
		annotationCommands,
		videoPath,
		videoSourcePath,
		cursorTelemetrySourcePath,
		normalizedCursorTelemetry,
		autoSuggestZoomsTrigger,
		handleAutoSuggestZoomsConsumed,
		disableSuggestedZooms,
		currentTime,
		isPlaying,
		handleSelectAnnotation,
		cursorExtras,
		sourceDurationMs,
	} = props;

	// Hover scrub (Screen Studio): the preview shows the moment under the pointer while the
	// playhead stays put; leaving, or clicking to seek, settles it again.
	const [frozenPlayhead, setFrozenPlayhead] = useState<number | null>(null);
	const restoreRef = useRef<number | null>(null);
	const livePlayheadRef = useRef(projection.timelinePlayheadTime);
	if (frozenPlayhead === null) livePlayheadRef.current = projection.timelinePlayheadTime;
	const pendingScrubRef = useRef<number | null>(null);
	const scrubFrameRef = useRef<number | null>(null);
	const { handleSeek, handleTimelineSeek } = playback;
	const handleHoverScrub = useCallback(
		(timeMs: number | null) => {
			if (timeMs === null) {
				pendingScrubRef.current = null;
				if (restoreRef.current !== null) {
					const restore = restoreRef.current;
					restoreRef.current = null;
					setFrozenPlayhead(null);
					handleSeek(restore);
				}
				return;
			}
			if (isPlaying) return;
			if (restoreRef.current === null) {
				restoreRef.current = livePlayheadRef.current;
				setFrozenPlayhead(livePlayheadRef.current);
			}
			pendingScrubRef.current = timeMs / 1000;
			if (scrubFrameRef.current !== null) return;
			scrubFrameRef.current = requestAnimationFrame(() => {
				scrubFrameRef.current = null;
				const target = pendingScrubRef.current;
				pendingScrubRef.current = null;
				if (target !== null && restoreRef.current !== null) handleSeek(target);
			});
		},
		[handleSeek, isPlaying],
	);
	const handleSeekFromTimeline = useCallback(
		(time: number, phase?: "start" | "move" | "end") => {
			restoreRef.current = null;
			pendingScrubRef.current = null;
			livePlayheadRef.current = time;
			setFrozenPlayhead(null);
			if (phase === "end") {
				// Drag finished at the same spot: the playhead is already there.
				playback.scrubEnd();
				return;
			}
			handleTimelineSeek(time);
			if (phase === "start") playback.scrubStart();
			if (phase === "move") playback.scrubMove(time);
		},
		[handleTimelineSeek, playback],
	);
	useEffect(() => {
		if (isPlaying && restoreRef.current !== null) {
			restoreRef.current = null;
			setFrozenPlayhead(null);
		}
	}, [isPlaying]);
	useEffect(
		() => () => {
			if (scrubFrameRef.current !== null) cancelAnimationFrame(scrubFrameRef.current);
		},
		[],
	);
	const clipTimelineActions = useClipTimelineActions({
		clipRegions: timeline.clipRegions,
		zoomRegions: timeline.zoomRegions,
		typingTimes: timeline.typingTimes,
		sourceDurationMs,
		clipCommands,
		onToggleZoomDisabled: zoomCommands.handleZoomDisabledToggle,
	});
	const shortcutBlocks = useMemo(
		() =>
			buildShortcutBlocks(
				timeline.keystrokes,
				timeline.disabledShortcutTimes,
				timeline.clipRegions,
				cursorExtras,
			),
		[timeline.keystrokes, timeline.disabledShortcutTimes, timeline.clipRegions, cursorExtras],
	);
	const { setDisabledShortcutTimes } = timeline;

	return (
		<div
			ref={props.panelRef}
			tabIndex={-1}
			data-timeline-panel
			className="outline-none flex flex-shrink-0 flex-col bg-transparent px-4 pb-4 pt-2"
			style={{ height: "22%", minHeight: 180, maxHeight: 280 }}
		>
			<ClipActionsProvider value={clipTimelineActions.actions}>
			<TimelineEditor
				ref={timelineRef}
				videoDuration={projection.timelineDuration}
				currentTime={frozenPlayhead ?? currentTime}
				playheadTime={frozenPlayhead ?? projection.timelinePlayheadTime}
				onSeek={handleSeekFromTimeline}
				onHoverScrub={handleHoverScrub}
				videoPath={videoPath}
				videoSourcePath={videoSourcePath}
				cursorTelemetrySourcePath={cursorTelemetrySourcePath}
				cursorTelemetry={normalizedCursorTelemetry}
				autoSuggestZoomsTrigger={autoSuggestZoomsTrigger}
				onAutoSuggestZoomsConsumed={handleAutoSuggestZoomsConsumed}
				disableSuggestedZooms={disableSuggestedZooms}
				zoomRegions={timeline.zoomRegions}
				onZoomAdded={zoomCommands.handleZoomAdded}
				onZoomSuggested={zoomCommands.handleZoomSuggested}
				onZoomSpanChange={zoomCommands.handleZoomSpanChange}
				onZoomDelete={zoomCommands.handleZoomDelete}
				selectedZoomId={timeline.selectedZoomId}
				onSelectZoom={zoomCommands.handleSelectZoom}
				trimRegions={timeline.trimRegions}
				clipRegions={timeline.clipRegions}
				onClipSplit={clipCommands.handleClipSplit}
				onClipDelete={clipCommands.handleClipDelete}
				onClipSpanChange={clipCommands.handleClipSpanChange}
				selectedClipId={timeline.selectedClipId}
				onSelectClip={clipCommands.handleSelectClip}
				audioRegions={timeline.audioRegions}
				onAudioAdded={audioCommands.handleAudioAdded}
				onAudioSpanChange={audioCommands.handleAudioSpanChange}
				onAudioDelete={audioCommands.handleAudioDelete}
				selectedAudioId={timeline.selectedAudioId}
				onSelectAudio={audioCommands.handleSelectAudio}
				captionRegions={projection.effectiveCaptionRegions}
				onCaptionSpanChange={(id, span) => {
					const fragment = projection.effectiveCaptionRegions.find(
						(cue) => cue.id === id,
					);
					if (!fragment) return;
					captionCommands.handleCaptionRetime(
						fragment.sourceCueId,
						retimeCaptionFragment(fragment, span),
					);
				}}
				selectedCaptionId={
					projection.effectiveCaptionRegions.find(
						(cue) =>
							cue.sourceCueId === timeline.selectedCaptionId &&
							currentTime * 1000 >= cue.startMs &&
							currentTime * 1000 < cue.endMs,
					)?.id ??
					projection.effectiveCaptionRegions.find(
						(cue) => cue.sourceCueId === timeline.selectedCaptionId,
					)?.id ??
					null
				}
				onSelectCaption={(id) => {
					const fragment = projection.effectiveCaptionRegions.find(
						(cue) => cue.id === id,
					);
					captionCommands.handleSelectCaption(fragment?.sourceCueId ?? null);
					if (fragment) playback.handleTimelineSeek(fragment.startMs / 1000);
				}}
				onCaptionDelete={(id) => {
					const fragment = projection.effectiveCaptionRegions.find(
						(cue) => cue.id === id,
					);
					if (fragment) captionCommands.handleCaptionDelete(fragment.sourceCueId);
				}}
				onCaptionAdded={captionCommands.handleCaptionAdded}
				captionsEnabled={timeline.autoCaptionSettings.enabled}
				captionQuickAddEnabled={timeline.autoCaptionSettings.timelineQuickAdd}
				annotationRegions={timeline.annotationRegions}
				onAnnotationAdded={annotationCommands.handleAnnotationAdded}
				onAnnotationSpanChange={annotationCommands.handleAnnotationSpanChange}
				onAnnotationDelete={annotationCommands.handleAnnotationDelete}
				selectedAnnotationId={timeline.selectedAnnotationId}
				onSelectAnnotation={handleSelectAnnotation}
				showSourceAudioTrack={timeline.clipRegions.some((clip) => clip.showSourceAudio)}
				sourceAudioResourceVersion={timeline.sourceAudioFallbackRefreshKey}
				sourceAudioTrackSettings={audio.activeSourceAudioTrackSettings}
				getSourceAudioTrackSettingsForClip={audio.getSourceAudioTrackSettingsForClip}
				onSourceAudioAvailabilityChange={timeline.setHasClipSourceAudio}
				onSourceAudioTracksMetaChange={audio.onSourceAudioTracksMetaChange}
				shortcutBlocks={shortcutBlocks}
				cameraLayout={
					props.webcam.enabled && props.webcam.sourcePath
						? {
								regions: props.webcam.layoutRegions ?? [],
								onChange: (layoutRegions) =>
									props.setWebcam((current) => ({ ...current, layoutRegions })),
							}
						: null
				}
				onShortcutDisabledChange={(times, disabled) =>
					setDisabledShortcutTimes((current) => {
						const next = new Set(current);
						for (const time of times) {
							if (disabled) next.add(time);
							else next.delete(time);
						}
						return [...next].sort((a, b) => a - b);
					})
				}
			/>
			</ClipActionsProvider>
			{clipTimelineActions.overlays}
		</div>
	);
}
