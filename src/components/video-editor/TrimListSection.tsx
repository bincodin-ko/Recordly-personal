import { Button } from "@/components/ui/button";
import { translate } from "@/contexts/I18nContext";
import { formatClockTime } from "./timeline/core/time";
import { findSplitPoints, findTrimGaps, type TrimGap } from "./trimRestore";
import type { ClipRegion } from "./types";

// Side-panel list of trimmed stretches. Restoring goes through the timeline's own
// "undo trim" flow (EditorTimelinePanel listens), so the effect-merge question still shows.
export const TRIM_RESTORE_EVENT = "trim-restore-request";
export const TRIM_RESTORE_ALL_EVENT = "trim-restore-all-request";
export const TRIM_SEEK_EVENT = "trim-seek-request";
export const TRIM_MERGE_EVENT = "trim-merge-request";

const formatSourceTime = formatClockTime;

/** Timeline position (ms) where a trimmed stretch would come back. */
export function trimGapTimelineMs(gap: TrimGap, clips: ClipRegion[]) {
	const after = clips.find((clip) => clip.id === gap.afterClipId);
	if (after) return after.startMs;
	const before = clips.find((clip) => clip.id === gap.beforeClipId);
	return before?.endMs ?? 0;
}

type Row = {
	key: string;
	timelineMs: number;
	label: string;
	disabledReason?: string;
	undo: () => void;
};

const send = (name: string, detail?: unknown) =>
	window.dispatchEvent(new CustomEvent(name, { detail }));

export function TrimListSection({
	clipRegions,
	sourceDurationMs,
}: {
	clipRegions: ClipRegion[];
	sourceDurationMs: number;
}) {
	const rows: Row[] = [
		...findSplitPoints(clipRegions).map((point) => ({
			key: point.id,
			timelineMs: point.timelineMs,
			label: translate("settings.trim.splitAt", "Cut at {{time}}", {
				time: formatSourceTime(point.sourceMs),
			}),
			disabledReason: point.mergeable
				? undefined
				: translate(
						"settings.trim.cannotJoin",
						"The two sides have different speed, volume or cursor settings.",
					),
			undo: () =>
				send(TRIM_MERGE_EVENT, {
					leftClipId: point.leftClipId,
					rightClipId: point.rightClipId,
				}),
		})),
		...findTrimGaps(clipRegions, sourceDurationMs).map((gap) => ({
			key: gap.id,
			timelineMs: trimGapTimelineMs(gap, clipRegions),
			label: translate("settings.trim.removed", "Removed {{start}} ~ {{end}}", {
				start: formatSourceTime(gap.startMs),
				end: formatSourceTime(gap.endMs),
			}),
			undo: () => send(TRIM_RESTORE_EVENT, gap.id),
		})),
	].sort((a, b) => a.timelineMs - b.timelineMs);

	if (rows.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				{translate("settings.trim.empty", "No cuts yet.")}
			</p>
		);
	}
	return (
		<section className="flex flex-col gap-2">
			<ul className="flex flex-col gap-1">
				{rows.map((row) => (
					<li key={row.key} className="flex items-center gap-2">
						<button
							type="button"
							className="flex-1 rounded-md px-2 py-1.5 text-left text-xs tabular-nums hover:bg-foreground/5"
							title={translate("settings.trim.seek", "Go to this spot")}
							onClick={() => send(TRIM_SEEK_EVENT, row.timelineMs / 1000)}
						>
							{row.label}
						</button>
						<span title={row.disabledReason}>
							<Button
								variant="outline"
								size="sm"
								className="h-7 shrink-0 text-xs"
								isDisabled={Boolean(row.disabledReason)}
								onClick={row.undo}
							>
								{translate("timeline.clipEdit.undoTrim", "Undo trim")}
							</Button>
						</span>
					</li>
				))}
			</ul>
			{rows.length > 1 && (
				<Button
					variant="ghost"
					size="sm"
					className="h-8 self-end text-xs"
					onClick={() => send(TRIM_RESTORE_ALL_EVENT)}
				>
					{translate("settings.trim.restoreAll", "Undo all trims")}
				</Button>
			)}
		</section>
	);
}
