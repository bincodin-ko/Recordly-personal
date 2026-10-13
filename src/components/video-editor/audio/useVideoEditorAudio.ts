import React, { useCallback, useMemo } from "react";
import type { SourceAudioTrackSettings } from "@/components/video-editor/audio/audioTypes";
import { getSourceTrackIdFromPath } from "@/lib/exporter/audioRoutingEngine";
import { resolveSourceTrackRoutingPolicy } from "@/lib/exporter/sourceTrackRoutingPolicy";
import type { AudioRegion, ClipRegion } from "../types";
import { findClipAtTimelineTime, getClipVolume } from "../types";
import { isClipMutedById } from "./clipAudio";
import type { AudioExtrasSettings } from "./audioExtras";
import { useAudioPreviewSync } from "./useAudioPreviewSync";
import { useBackgroundMusicPreview } from "./useBackgroundMusicPreview";
import { useClipAudioSettingsController } from "./useClipAudioSettingsController";
import { useSourceAudioFallback } from "./useSourceAudioFallback";

function extractLocalPathFromMediaServerUrl(input: string | null | undefined): string | null {
	if (!input) return null;
	try {
		const url = new URL(input);
		const isLocalMediaServer =
			(url.protocol === "http:" || url.protocol === "https:") &&
			(url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
			url.pathname === "/video";
		if (!isLocalMediaServer) return null;
		return url.searchParams.get("path");
	} catch {
		return null;
	}
}

interface UseVideoEditorAudioParams {
	currentSourcePath: string | null;
	audioExtras: AudioExtrasSettings;
	selectedClipId: string | null;
	clipRegions: ClipRegion[];
	audioRegions: AudioRegion[];
	sourceAudioTrackSettingsByClip: Record<string, SourceAudioTrackSettings>;
	setSourceAudioTrackSettingsByClip: React.Dispatch<
		React.SetStateAction<Record<string, SourceAudioTrackSettings>>
	>;
	defaultSourceAudioTrackSettings: SourceAudioTrackSettings;
	setDefaultSourceAudioTrackSettings: React.Dispatch<
		React.SetStateAction<SourceAudioTrackSettings>
	>;
	currentTime: number;
	timelineTime: number;
	duration: number;
	isPlaying: boolean;
	previewVolume: number;
	sourceAudioFallbackRefreshKey?: number;
	summarizeErrorMessage: (message: string) => string;
	onSourceFallbackLoadError: (error: unknown) => void;
}

export function useVideoEditorAudio({
	currentSourcePath,
	audioExtras,
	selectedClipId,
	clipRegions,
	audioRegions,
	sourceAudioTrackSettingsByClip,
	setSourceAudioTrackSettingsByClip,
	defaultSourceAudioTrackSettings,
	setDefaultSourceAudioTrackSettings,
	currentTime,
	timelineTime,
	duration,
	isPlaying,
	previewVolume,
	sourceAudioFallbackRefreshKey = 0,
	summarizeErrorMessage,
	onSourceFallbackLoadError,
}: UseVideoEditorAudioParams) {
	const fallbackLookupSourcePath = useMemo(
		() => extractLocalPathFromMediaServerUrl(currentSourcePath) ?? currentSourcePath,
		[currentSourcePath],
	);

	const { sourceAudioFallbackPaths, sourceAudioFallbackStartDelayMsByPath, micEnhanceStatus } =
		useSourceAudioFallback({
			currentSourcePath: fallbackLookupSourcePath,
			micMode: audioExtras.micMode,
			refreshKey: sourceAudioFallbackRefreshKey,
			summarizeErrorMessage,
		});

	const sourceTrackRoutingPolicy = useMemo(
		() => resolveSourceTrackRoutingPolicy(currentSourcePath, sourceAudioFallbackPaths),
		[currentSourcePath, sourceAudioFallbackPaths],
	);
	const previewSourceAudioFallbackPaths = sourceTrackRoutingPolicy.playbackPaths;
	const shouldMutePreviewVideo = sourceTrackRoutingPolicy.muteEmbeddedPreview;

	const activeClipIdAtCurrentTime = useMemo(
		() => findClipAtTimelineTime(timelineTime * 1000, clipRegions)?.id ?? null,
		[clipRegions, timelineTime],
	);
	const isCurrentClipMuted = useMemo(
		() =>
			activeClipIdAtCurrentTime === null ||
			isClipMutedById(activeClipIdAtCurrentTime, clipRegions),
		[activeClipIdAtCurrentTime, clipRegions],
	);

	const currentClipVolume = useMemo(() => {
		const clip = clipRegions.find((c) => c.id === activeClipIdAtCurrentTime);
		return clip ? getClipVolume(clip) : 1;
	}, [activeClipIdAtCurrentTime, clipRegions]);

	const {
		sourceAudioTrackMeta,
		activeSourceAudioTrackSettings,
		selectedClipSourceAudioTrackSettings,
		getSourceAudioTrackSettingsForClip,
		onSourceAudioTracksMetaChange,
		onSelectedClipSourceAudioTrackVolumeChange,
		onSelectedClipSourceAudioTrackNormalizeChange,
		embeddedSourcePreviewGain: baseEmbeddedSourcePreviewGain,
		getSourceTrackPreviewGain: baseGetSourceTrackPreviewGain,
	} = useClipAudioSettingsController({
		selectedClipId,
		activeClipId: activeClipIdAtCurrentTime,
		sourceAudioTrackSettingsByClip,
		setSourceAudioTrackSettingsByClip,
		defaultSourceAudioTrackSettings,
		setDefaultSourceAudioTrackSettings,
	});

	// Per-segment volume scales the recording's own audio (not imported audio tracks).
	const embeddedSourcePreviewGain = baseEmbeddedSourcePreviewGain * currentClipVolume;
	const micMuted = audioExtras.micMuted;
	const getSourceTrackPreviewGain = useCallback(
		(audioPath: string) =>
			micMuted && getSourceTrackIdFromPath(audioPath) === "mic"
				? 0
				: baseGetSourceTrackPreviewGain(audioPath) * currentClipVolume,
		[baseGetSourceTrackPreviewGain, currentClipVolume, micMuted],
	);
	// "Mute microphone" is the mic track at volume 0 for every consumer (preview, export).
	const withMicMute = useCallback(
		(settings: SourceAudioTrackSettings): SourceAudioTrackSettings =>
			micMuted ? { ...settings, mic: { volume: 0, normalize: false } } : settings,
		[micMuted],
	);
	const mutedActiveSettings = useMemo(
		() => withMicMute(activeSourceAudioTrackSettings),
		[withMicMute, activeSourceAudioTrackSettings],
	);
	const mutedSelectedSettings = useMemo(
		() => withMicMute(selectedClipSourceAudioTrackSettings),
		[withMicMute, selectedClipSourceAudioTrackSettings],
	);
	const getMutedSettingsForClip = useCallback(
		(clipId: string | null) => withMicMute(getSourceAudioTrackSettingsForClip(clipId)),
		[withMicMute, getSourceAudioTrackSettingsForClip],
	);

	const { playSourceAudioPreview } = useAudioPreviewSync({
		audioRegions,
		previewVolume,
		isPlaying,
		currentTime,
		timelineTime,
		duration,
		sourcePlaybackRate: findClipAtTimelineTime(timelineTime * 1000, clipRegions)?.speed ?? 1,
		previewSourceAudioFallbackPaths,
		sourceAudioFallbackStartDelayMsByPath,
		sourceAudioResourceVersion: sourceAudioFallbackRefreshKey,
		isCurrentClipMuted,
		getSourceTrackPreviewGain,
		onSourceFallbackLoadError,
	});

	useBackgroundMusicPreview({
		music: audioExtras.music,
		speechSourcePath:
			sourceAudioFallbackPaths.find((audioPath) => /\.mic\./i.test(audioPath)) ??
			fallbackLookupSourcePath,
		clipRegions,
		duration,
		timelineTime,
		isPlaying,
		previewVolume,
	});

	return {
		micEnhanceStatus,
		sourceAudioFallbackPaths,
		sourceAudioFallbackStartDelayMsByPath,
		previewSourceAudioFallbackPaths,
		shouldMutePreviewVideo,
		activeClipIdAtCurrentTime,
		isCurrentClipMuted,
		sourceAudioTrackMeta,
		activeSourceAudioTrackSettings: mutedActiveSettings,
		selectedClipSourceAudioTrackSettings: mutedSelectedSettings,
		playSourceAudioPreview,
		getSourceAudioTrackSettingsForClip: getMutedSettingsForClip,
		onSourceAudioTracksMetaChange,
		onSelectedClipSourceAudioTrackVolumeChange,
		onSelectedClipSourceAudioTrackNormalizeChange,
		embeddedSourcePreviewGain,
		getSourceTrackPreviewGain,
	};
}
