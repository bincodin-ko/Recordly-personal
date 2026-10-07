import { translate } from "@/contexts/I18nContext";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MicAudioMode } from "./audioExtras";
import { toast } from "@/components/ui/toast";
import { SOURCE_AUDIO_FALLBACK_TOAST_ID } from "@/components/video-editor/audio/audioTypes";

interface UseSourceAudioFallbackParams {
	currentSourcePath: string | null;
	micMode?: MicAudioMode;
	refreshKey?: number;
	summarizeErrorMessage: (message: string) => string;
}

export function useSourceAudioFallback({
	currentSourcePath,
	micMode = "standard",
	refreshKey = 0,
	summarizeErrorMessage,
}: UseSourceAudioFallbackParams) {
	const [sourceAudioFallbackPaths, setSourceAudioFallbackPaths] = useState<string[]>([]);
	const [sourceAudioFallbackStartDelayMsByPath, setSourceAudioFallbackStartDelayMsByPath] =
		useState<Record<string, number>>({});
	const previousSourcePathRef = useRef<string | null>(null);
	// Which lookup finished last, so export can wait for companion (mic) audio.
	const lookupKey = `${currentSourcePath}|${refreshKey}`;
	const [finishedLookupKey, setFinishedLookupKey] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		// Refetch when late recording sidecars are finalized after the editor opens.
		void refreshKey;
		const sourceChanged = previousSourcePathRef.current !== currentSourcePath;
		previousSourcePathRef.current = currentSourcePath;
		if (sourceChanged) {
			setSourceAudioFallbackPaths([]);
			setSourceAudioFallbackStartDelayMsByPath({});
		}

		if (!currentSourcePath) {
			return () => {
				cancelled = true;
			};
		}

		void (async () => {
			try {
				await lookUp(currentSourcePath);
			} finally {
				if (!cancelled) setFinishedLookupKey(`${currentSourcePath}|${refreshKey}`);
			}
		})();
		async function lookUp(sourcePath: string) {
			try {
				const result =
					await window.electronAPI.getVideoAudioFallbackPaths(sourcePath);
				if (cancelled) {
					return;
				}
				if (!result.success) {
					if (sourceChanged) {
						setSourceAudioFallbackPaths([]);
						setSourceAudioFallbackStartDelayMsByPath({});
					}
					toast.warning(
						result.error
							? translate("editor.audio.companionLoadFailedWith", "Could not load companion audio sources: {{error}}", { error: summarizeErrorMessage(result.error) })
							: translate("editor.audio.companionLoadFailed", "Could not load companion audio sources. Playback and export may miss microphone audio."),
						{ id: SOURCE_AUDIO_FALLBACK_TOAST_ID, duration: 10000 },
					);
					return;
				}

				toast.dismiss(SOURCE_AUDIO_FALLBACK_TOAST_ID);
				setSourceAudioFallbackPaths(result.paths ?? []);
				setSourceAudioFallbackStartDelayMsByPath(result.startDelayMsByPath ?? {});
			} catch (error) {
				if (!cancelled) {
					if (sourceChanged) {
						setSourceAudioFallbackPaths([]);
						setSourceAudioFallbackStartDelayMsByPath({});
					}
					toast.warning(
						translate("editor.audio.companionLoadFailedWith", "Could not load companion audio sources: {{error}}", { error: summarizeErrorMessage(String(error)) }),
						{ id: SOURCE_AUDIO_FALLBACK_TOAST_ID, duration: 10000 },
					);
				}
			}
		}

		return () => {
			cancelled = true;
		};
	}, [currentSourcePath, refreshKey, summarizeErrorMessage]);

	// Mic audio mode: swap the mic sidecar for a cleaned copy rendered in the main
	// process, so preview and export both play the enhanced file.
	const micPath = sourceAudioFallbackPaths.find((audioPath) => /\.mic\./i.test(audioPath)) ?? null;
	const [enhanced, setEnhanced] = useState<{ key: string; path: string | null; error?: string }>({
		key: "",
		path: null,
	});
	const enhanceKey = micPath && micMode !== "standard" ? `${micPath}|${micMode}|${refreshKey}` : "";
	useEffect(() => {
		if (!enhanceKey || !micPath) return;
		let cancelled = false;
		void window.electronAPI
			.enhanceMicAudio({ path: micPath, mode: micMode })
			.then((result) => {
				if (cancelled) return;
				setEnhanced({
					key: enhanceKey,
					path: result.success ? (result.path ?? null) : null,
					error: result.success ? undefined : (result.error ?? "failed"),
				});
				if (!result.success) {
					toast.error(
						translate("settings.audio.micModeFailed", "Couldn't enhance the microphone audio: {{error}}", {
							error: summarizeErrorMessage(result.error ?? ""),
						}),
					);
				}
			})
			.catch((error) => {
				if (!cancelled) setEnhanced({ key: enhanceKey, path: null, error: String(error) });
			});
		return () => {
			cancelled = true;
		};
	}, [enhanceKey, micMode, micPath, summarizeErrorMessage]);

	const enhancedPath = enhanceKey && enhanced.key === enhanceKey ? enhanced.path : null;
	const micEnhanceStatus: "off" | "processing" | "ready" | "error" | "no-mic" =
		currentSourcePath && finishedLookupKey !== lookupKey
			? "processing"
			: micMode === "standard"
			? "off"
			: !micPath
				? "no-mic"
				: enhanced.key !== enhanceKey
					? "processing"
					: enhancedPath
						? "ready"
						: "error";

	const effective = useMemo(() => {
		if (!micPath || !enhancedPath) {
			return { paths: sourceAudioFallbackPaths, delays: sourceAudioFallbackStartDelayMsByPath };
		}
		const delays = { ...sourceAudioFallbackStartDelayMsByPath };
		if (micPath in delays) delays[enhancedPath] = delays[micPath];
		return {
			paths: sourceAudioFallbackPaths.map((audioPath) =>
				audioPath === micPath ? enhancedPath : audioPath,
			),
			delays,
		};
	}, [enhancedPath, micPath, sourceAudioFallbackPaths, sourceAudioFallbackStartDelayMsByPath]);

	return {
		sourceAudioFallbackPaths: effective.paths,
		sourceAudioFallbackStartDelayMsByPath: effective.delays,
		micEnhanceStatus,
	};
}
