import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { translate } from "@/contexts/I18nContext";
import type { useClipRegionCommands } from "../../hooks/useClipRegionCommands";
import { TRIM_MERGE_EVENT, TRIM_RESTORE_ALL_EVENT, TRIM_RESTORE_EVENT } from "../../TrimListSection";
import { decideRestore, findTrimGaps, type TrimGap } from "../../trimRestore";
import {
	type ClipRegion,
	getClipSourceEndMs,
	getClipSourceStartMs,
	mapSourceTimeToTimelineTime,
	type ZoomRegion,
} from "../../types";
import {
	DEFAULT_TYPING_SPEED,
	detectTypingBursts,
	type TypingSuggestion,
} from "../../typingSpeedUp";
import type { ClipActions } from "../core/ClipActionsContext";
import { ClipTimelineOverlays, type OverlayState } from "./ClipTimelineOverlays";

interface Params {
	clipRegions: ClipRegion[];
	zoomRegions: ZoomRegion[];
	typingTimes: number[];
	sourceDurationMs: number;
	clipCommands: ReturnType<typeof useClipRegionCommands>;
	onToggleZoomDisabled: (id: string) => void;
}

/** Already sped up: every footage piece under the burst plays at a non-default speed. */
function isAlreadySped(suggestion: TypingSuggestion, clips: ClipRegion[]) {
	const pieces = clips.filter(
		(clip) =>
			getClipSourceStartMs(clip) < suggestion.endMs &&
			getClipSourceEndMs(clip) > suggestion.startMs,
	);
	return pieces.length > 0 && pieces.every((clip) => clip.speed !== 1);
}

export function useClipTimelineActions(params: Params) {
	const {
		clipRegions,
		zoomRegions,
		typingTimes,
		sourceDurationMs,
		clipCommands,
		onToggleZoomDisabled,
	} = params;
	const [overlay, setOverlay] = useState<OverlayState | null>(null);
	const [typingSpeed, setTypingSpeed] = useState(DEFAULT_TYPING_SPEED);

	const gaps = useMemo(
		() => findTrimGaps(clipRegions, sourceDurationMs),
		[clipRegions, sourceDurationMs],
	);
	const suggestions = useMemo(
		() =>
			detectTypingBursts(typingTimes, sourceDurationMs).filter(
				(s) => !isAlreadySped(s, clipRegions),
			),
		[typingTimes, sourceDurationMs, clipRegions],
	);

	const actions = useMemo<ClipActions>(
		() => ({
			trimBubbles: gaps.map((gap) => ({
				id: gap.id,
				leftClipId: gap.beforeClipId,
				rightClipId: gap.afterClipId,
			})),
			typingBadges: suggestions.flatMap((s) => {
				const startMs = mapSourceTimeToTimelineTime(s.startMs, clipRegions);
				const endMs = mapSourceTimeToTimelineTime(s.endMs, clipRegions);
				return endMs > startMs ? [{ id: s.id, startMs, endMs, keyCount: s.keyCount }] : [];
			}),
			openClipMenu: (clipId, x, y) => setOverlay({ kind: "menu", clipId, x, y }),
			openZoomMenu: (zoomId, x, y) => setOverlay({ kind: "zoomMenu", zoomId, x, y }),
			openTrimRestore: (bubbleId) => {
				const gap = gaps.find((g) => g.id === bubbleId);
				if (!gap) return;
				const decision = decideRestore(gap, clipRegions, zoomRegions);
				if (decision.kind === "plain") {
					clipCommands.handleRestoreTrim(gap, null);
					return;
				}
				setOverlay({ kind: "restore", gap, decision });
			},
			openTypingPopover: (id, x, y) => setOverlay({ kind: "typing", id, x, y }),
		}),
		[gaps, suggestions, clipRegions, zoomRegions, clipCommands],
	);

	// Side-panel trim list: same undo-trim flow as the timeline bubble.
	useEffect(() => {
		const onRestore = (event: Event) =>
			actions.openTrimRestore((event as CustomEvent<string>).detail);
		const onRestoreAll = () => {
			const plain = gaps.filter(
				(gap) => decideRestore(gap, clipRegions, zoomRegions).kind === "plain",
			);
			// Also joins every scissors cut (empty list = joins only).
			clipCommands.handleRestoreTrims(plain);
			// Gaps whose effects must be chosen still ask, one at a time.
			const pending = gaps.find((gap) => !plain.includes(gap));
			if (pending) actions.openTrimRestore(pending.id);
		};
		const onMerge = (event: Event) =>
			clipCommands.handleMergeSplit(
				(event as CustomEvent<{ leftClipId: string; rightClipId: string }>).detail,
			);
		window.addEventListener(TRIM_MERGE_EVENT, onMerge);
		window.addEventListener(TRIM_RESTORE_EVENT, onRestore);
		window.addEventListener(TRIM_RESTORE_ALL_EVENT, onRestoreAll);
		return () => {
			window.removeEventListener(TRIM_MERGE_EVENT, onMerge);
			window.removeEventListener(TRIM_RESTORE_EVENT, onRestore);
			window.removeEventListener(TRIM_RESTORE_ALL_EVENT, onRestoreAll);
		};
	}, [actions, gaps, clipRegions, zoomRegions, clipCommands]);

	const close = useCallback(() => setOverlay(null), []);
	const applyTyping = useCallback(
		(targets: TypingSuggestion[]) => {
			clipCommands.handleApplySpeedRanges(
				targets.map((s) => ({ startMs: s.startMs, endMs: s.endMs, speed: typingSpeed })),
			);
			toast.success(
				translate("timeline.clipEdit.typingApplied", "Sped up {{count}} typing sections", {
					count: targets.length,
				}),
			);
			setOverlay(null);
		},
		[clipCommands, typingSpeed],
	);

	const overlays: ReactNode = (
		<ClipTimelineOverlays
			overlay={overlay}
			clips={clipRegions}
			suggestions={suggestions}
			typingSpeed={typingSpeed}
			onTypingSpeedChange={setTypingSpeed}
			onApplyTyping={applyTyping}
			zoomRegions={zoomRegions}
			onToggleZoom={onToggleZoomDisabled}
			onClose={close}
			commands={clipCommands}
			onRestore={(gap: TrimGap, side) => {
				clipCommands.handleRestoreTrim(gap, side);
				setOverlay(null);
			}}
		/>
	);

	return { actions, overlays, hasTypingData: typingTimes.length > 0 };
}
