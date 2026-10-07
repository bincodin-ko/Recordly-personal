import { useEffect, useMemo, useRef, useState } from "react";
import { resolveMediaElementSource } from "@/lib/exporter/localMediaSource";
import type { ClipRegion } from "../types";
import { getClipSourceEndMs, getClipSourceStartMs, getTimelineDurationMs } from "../types";
import {
	type BackgroundMusicSettings,
	buildDuckCurve,
	computeSpeechGate,
	sampleDuckCurve,
} from "./audioExtras";

interface Params {
	music: BackgroundMusicSettings;
	/** Mic sidecar (preferred) or the recording itself; what ducking listens to. */
	speechSourcePath: string | null;
	clipRegions: ClipRegion[];
	duration: number;
	timelineTime: number;
	isPlaying: boolean;
	previewVolume: number;
}

async function decodeSpeechGate(path: string): Promise<Uint8Array> {
	const { src, revoke } = await resolveMediaElementSource(path);
	try {
		const bytes = await (await fetch(src)).arrayBuffer();
		const ctx = new OfflineAudioContext(1, 1, 16000);
		const buffer = await ctx.decodeAudioData(bytes);
		const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
			buffer.getChannelData(ch),
		);
		return computeSpeechGate(channels, buffer.sampleRate);
	} finally {
		revoke();
	}
}

/** Plays the looped background music in the editor preview, ducked like the export. */
export function useBackgroundMusicPreview({
	music,
	speechSourcePath,
	clipRegions,
	duration,
	timelineTime,
	isPlaying,
	previewVolume,
}: Params) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [gate, setGate] = useState<Uint8Array | null>(null);

	useEffect(() => {
		if (!music.path) return;
		const audio = new Audio();
		audio.loop = true;
		audio.preload = "auto";
		audioRef.current = audio;
		let revoke = () => undefined as void;
		void resolveMediaElementSource(music.path).then((resolved) => {
			if (audioRef.current !== audio) return resolved.revoke();
			revoke = resolved.revoke;
			audio.src = resolved.src;
		});
		return () => {
			audio.pause();
			audio.src = "";
			revoke();
			if (audioRef.current === audio) audioRef.current = null;
		};
	}, [music.path]);

	useEffect(() => {
		setGate(null);
		if (!music.path || !music.ducking || !speechSourcePath) return;
		let cancelled = false;
		decodeSpeechGate(speechSourcePath)
			.then((next) => !cancelled && setGate(next))
			.catch((error) => console.warn("[BackgroundMusic] speech analysis failed", error));
		return () => {
			cancelled = true;
		};
	}, [music.path, music.ducking, speechSourcePath]);

	const duckCurve = useMemo(() => {
		if (!music.path || !Number.isFinite(duration) || duration <= 0) return null;
		const sourceMs = duration * 1000;
		const slices =
			clipRegions.length > 0
				? clipRegions.map((clip) => ({
						outputStartMs: clip.startMs,
						sourceStartMs: getClipSourceStartMs(clip),
						sourceEndMs: getClipSourceEndMs(clip),
						speed: clip.speed,
					}))
				: [{ outputStartMs: 0, sourceStartMs: 0, sourceEndMs: sourceMs, speed: 1 }];
		return buildDuckCurve(
			music.ducking ? gate : null,
			slices,
			getTimelineDurationMs(clipRegions, sourceMs),
		);
	}, [clipRegions, duration, gate, music.ducking, music.path]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = Math.max(
			0,
			Math.min(1, music.volume * previewVolume * sampleDuckCurve(duckCurve, timelineTime)),
		);
		if (!isPlaying) {
			if (!audio.paused) audio.pause();
			return;
		}
		if (Number.isFinite(audio.duration) && audio.duration > 0) {
			const target = timelineTime % audio.duration;
			if (Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
		}
		if (audio.paused) audio.play().catch(() => undefined);
	}, [duckCurve, isPlaying, music.volume, previewVolume, timelineTime]);
}
