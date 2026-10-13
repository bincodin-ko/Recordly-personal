import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import {
	JKL_IDLE,
	type JklKey,
	type JklState,
	jklRate,
	jklReduce,
	jklUsesNativePlayback,
} from "../scrub/jkl";
import { ScrubAudio, type ScrubSource } from "../scrub/scrubAudio";
import { scrubRate } from "../scrub/scrubMath";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { VideoPlaybackRef } from "../VideoPlayback";

interface UseEditorPlaybackControlsParams {
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	timelineRef: RefObject<TimelineEditorHandle | null>;
	playSourceAudioPreview: () => void;
	timelinePlayheadTime: number;
	timelineDuration: number;
	/** Audio used for audible scrubbing and J/K/L. */
	scrubAudio: {
		videoResource: string | null;
		fallbackPaths: string[];
		fallbackDelayMsByPath: Record<string, number>;
		embeddedGain: number;
		getTrackGain: (audioPath: string) => number;
		mapTimelineMsToSourceMs: (timelineMs: number) => number;
	};
}

const GRAIN_INTERVAL_SECONDS = 0.06;
const JKL_STALE_CHECK_MS = 250;

function isTypingTarget(target: EventTarget | null) {
	const element = target as HTMLElement | null;
	return (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement ||
		Boolean(element?.isContentEditable) ||
		Boolean(element?.closest?.("[data-recording-library]"))
	);
}

export function useEditorPlaybackControls({
	videoPlaybackRef,
	timelineRef,
	playSourceAudioPreview,
	timelinePlayheadTime,
	timelineDuration,
	scrubAudio,
}: UseEditorPlaybackControlsParams) {
	const getActivePlayback = useCallback(() => videoPlaybackRef.current, [videoPlaybackRef]);
	const latest = useRef({ timelinePlayheadTime, timelineDuration, scrubAudio });
	latest.current = { timelinePlayheadTime, timelineDuration, scrubAudio };

	const startPlayback = useCallback(() => {
		const playback = getActivePlayback();
		if (!playback?.video) return;

		playSourceAudioPreview();
		playback.play().catch((error) => console.error("Video play failed:", error));
	}, [getActivePlayback, playSourceAudioPreview]);

	const togglePlayPause = useCallback(() => {
		const playback = getActivePlayback();
		const video = playback?.video;
		if (!playback || !video) return;

		if (playback.isPlaying) playback.pause();
		else startPlayback();
	}, [getActivePlayback, startPlayback]);

	const handleSeek = useCallback(
		(time: number, options: { pause?: boolean } = {}) => {
			const playback = getActivePlayback();
			const video = playback?.video;
			if (!video) return;

			if (options.pause) playback.pause();
			playback.seekTimeline(time);
		},
		[getActivePlayback],
	);

	// --- Audible scrubbing (Screen Studio "Scrubber": drag speed = audio speed, either way) ---
	const scrubEngine = useRef<ScrubAudio | null>(null);
	const scrubLast = useRef<{ source: number; wall: number } | null>(null);
	const scrubLastGrainWall = useRef(0);
	const scrubSmoothedRate = useRef(0);
	const jklState = useRef<JklState>(JKL_IDLE);
	const jklFrame = useRef<number | null>(null);

	const getScrubEngine = useCallback(() => {
		scrubEngine.current ??= new ScrubAudio();
		const { scrubAudio: audio } = latest.current;
		const sources: ScrubSource[] =
			audio.fallbackPaths.length > 0
				? audio.fallbackPaths.map((resource) => ({
						resource,
						delaySeconds: (audio.fallbackDelayMsByPath[resource] ?? 0) / 1000,
						gain: () => audio.getTrackGain(resource),
					}))
				: audio.videoResource
					? [{ resource: audio.videoResource, delaySeconds: 0, gain: () => audio.embeddedGain }]
					: [];
		scrubEngine.current.setSources(sources);
		return scrubEngine.current;
	}, []);

	const grain = useCallback(
		(timelineSeconds: number, rate: number) => {
			const sourceSeconds =
				latest.current.scrubAudio.mapTimelineMsToSourceMs(timelineSeconds * 1000) / 1000;
			(
				window as unknown as {
					__recordlyScrubGrains?: { sourceSeconds: number; rate: number }[];
				}
			).__recordlyScrubGrains?.push({ sourceSeconds, rate });
			void getScrubEngine().play(sourceSeconds, rate);
		},
		[getScrubEngine],
	);

	const stopJkl = useCallback(() => {
		if (jklFrame.current !== null) cancelAnimationFrame(jklFrame.current);
		jklFrame.current = null;
		jklState.current = JKL_IDLE;
	}, []);

	const scrubStart = useCallback(() => {
		stopJkl();
		scrubLast.current = null;
		scrubSmoothedRate.current = 0;
		getScrubEngine().warmUp();
	}, [getScrubEngine, stopJkl]);

	const scrubMove = useCallback(
		(timelineSeconds: number) => {
			const wall = performance.now() / 1000;
			const source =
				latest.current.scrubAudio.mapTimelineMsToSourceMs(timelineSeconds * 1000) / 1000;
			const last = scrubLast.current;
			scrubLast.current = { source, wall };
			if (!last) return;
			const instant = scrubRate(source - last.source, wall - last.wall);
			if (instant === 0) {
				scrubSmoothedRate.current = 0;
				return;
			}
			scrubSmoothedRate.current = 0.5 * scrubSmoothedRate.current + 0.5 * instant;
			if (wall - scrubLastGrainWall.current < GRAIN_INTERVAL_SECONDS) return;
			scrubLastGrainWall.current = wall;
			grain(timelineSeconds, scrubSmoothedRate.current);
		},
		[grain],
	);

	const scrubEnd = useCallback(() => {
		scrubLast.current = null;
		scrubSmoothedRate.current = 0;
	}, []);

	// --- J / K / L ---
	const runJklLoop = useCallback(
		(state: JklState) => {
			const playback = getActivePlayback();
			if (!playback?.video) return;
			const rate = jklRate(state);
			let timelineSeconds = latest.current.timelinePlayheadTime;
			let previous = performance.now();
			const startedAt = previous;
			let lastGrainWall = 0;
			const step = (now: number) => {
				if (jklState.current !== state) return;
				if (playback.isPlaying && now - startedAt > JKL_STALE_CHECK_MS) {
					stopJkl();
					return;
				}
				timelineSeconds += (rate * (now - previous)) / 1000;
				previous = now;
				const end = latest.current.timelineDuration;
				const atEdge = timelineSeconds <= 0 || timelineSeconds >= end;
				timelineSeconds = Math.max(0, Math.min(end, timelineSeconds));
				playback.seekTimeline(timelineSeconds);
				if (now / 1000 - lastGrainWall >= GRAIN_INTERVAL_SECONDS) {
					lastGrainWall = now / 1000;
					grain(timelineSeconds, rate);
				}
				if (atEdge) {
					stopJkl();
					return;
				}
				jklFrame.current = requestAnimationFrame(step);
			};
			getScrubEngine().warmUp();
			jklFrame.current = requestAnimationFrame(step);
		},
		[getActivePlayback, getScrubEngine, grain, stopJkl],
	);

	const pressJkl = useCallback(
		(key: JklKey) => {
			const playback = getActivePlayback();
			if (!playback?.video) return;
			// A state left over from Space/seek is stale: start fresh.
			if (jklState.current.dir !== 0 && jklFrame.current === null && !playback.isPlaying) {
				jklState.current = JKL_IDLE;
			}
			if (jklFrame.current !== null) {
				cancelAnimationFrame(jklFrame.current);
				jklFrame.current = null;
			}
			const next = jklReduce(jklState.current, key);
			jklState.current = next;
			if (next.dir === 0) {
				playback.pause();
			} else if (jklUsesNativePlayback(next)) {
				if (!playback.isPlaying) startPlayback();
			} else {
				playback.pause();
				runJklLoop(next);
			}
		},
		[getActivePlayback, runJklLoop, startPlayback],
	);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || event.repeat) return;
			if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
			if (isTypingTarget(event.target)) return;
			const key = event.key.toLowerCase();
			if (key !== "j" && key !== "k" && key !== "l") return;
			event.preventDefault();
			pressJkl(key);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [pressJkl]);

	useEffect(
		() => () => {
			stopJkl();
			scrubEngine.current?.dispose();
			scrubEngine.current = null;
		},
		[stopJkl],
	);

	const handleTimelineSeek = useCallback(
		(time: number) => {
			stopJkl();
			handleSeek(time, { pause: true });
		},
		[handleSeek, stopJkl],
	);

	const handlePreviewSkipBack = useCallback(() => {
		const currentMs = timelinePlayheadTime * 1000;
		const keyframes = timelineRef.current?.keyframes ?? [];
		const previous = [...keyframes]
			.reverse()
			.find((keyframe) => keyframe.time < currentMs - 50);
		handleSeek(previous ? previous.time / 1000 : Math.max(0, timelinePlayheadTime - 5));
	}, [handleSeek, timelinePlayheadTime, timelineRef]);

	const handlePreviewSkipForward = useCallback(() => {
		const currentMs = timelinePlayheadTime * 1000;
		const keyframes = timelineRef.current?.keyframes ?? [];
		const next = keyframes.find((keyframe) => keyframe.time > currentMs + 50);
		handleSeek(next ? next.time / 1000 : Math.min(timelineDuration, timelinePlayheadTime + 5));
	}, [handleSeek, timelineDuration, timelinePlayheadTime, timelineRef]);

	return useMemo(
		() => ({
			startPlayback,
			togglePlayPause,
			handleSeek,
			handleTimelineSeek,
			handlePreviewSkipBack,
			handlePreviewSkipForward,
			scrubStart,
			scrubMove,
			scrubEnd,
		}),
		[
			startPlayback,
			togglePlayPause,
			handleSeek,
			handleTimelineSeek,
			handlePreviewSkipBack,
			handlePreviewSkipForward,
			scrubStart,
			scrubMove,
			scrubEnd,
		],
	);
}
