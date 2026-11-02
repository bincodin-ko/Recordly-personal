import { Button } from "@/components/ui/button";
import { translate } from "@/contexts/I18nContext";
import { findTrimGaps, type TrimGap } from "./trimRestore";
import type { ClipRegion } from "./types";

// Side-panel list of trimmed stretches. Restoring goes through the timeline's own
// "undo trim" flow (EditorTimelinePanel listens), so the effect-merge question still shows.
export const TRIM_RESTORE_EVENT = "trim-restore-request";
export const TRIM_RESTORE_ALL_EVENT = "trim-restore-all-request";
export const TRIM_SEEK_EVENT = "trim-seek-request";

function formatSourceTime(ms: number) {
	const totalSeconds = Math.max(0, ms) / 1000;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = (totalSeconds - minutes * 60).toFixed(1).padStart(4, "0");
	return `${minutes}:${seconds}`;
}

/** Timeline position (ms) where a trimmed stretch would come back. */
export function trimGapTimelineMs(gap: TrimGap, clips: ClipRegion[]) {
	const after = clips.find((clip) => clip.id === gap.afterClipId);
	if (after) return after.startMs;
	const before = clips.find((clip) => clip.id === gap.beforeClipId);
	return before?.endMs ?? 0;
}

export function TrimListSection({
	clipRegions,
	sourceDurationMs,
}: {
	clipRegions: ClipRegion[];
	sourceDurationMs: number;
}) {
	const gaps = findTrimGaps(clipRegions, sourceDurationMs);
	if (gaps.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				{translate("settings.trim.empty", "No trimmed parts yet.")}
			</p>
		);
	}
	return (
		<section className="flex flex-col gap-2">
			<ul className="flex flex-col gap-1">
				{gaps.map((gap) => (
					<li key={gap.id} className="flex items-center gap-2">
						<button
							type="button"
							className="flex-1 rounded-md px-2 py-1.5 text-left text-xs tabular-nums hover:bg-foreground/5"
							title={translate("settings.trim.seek", "Go to this spot")}
							onClick={() =>
								window.dispatchEvent(
									new CustomEvent(TRIM_SEEK_EVENT, {
										detail: trimGapTimelineMs(gap, clipRegions) / 1000,
									}),
								)
							}
						>
							{formatSourceTime(gap.startMs)} ~ {formatSourceTime(gap.endMs)}
						</button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 shrink-0 text-xs"
							onClick={() =>
								window.dispatchEvent(
									new CustomEvent(TRIM_RESTORE_EVENT, { detail: gap.id }),
								)
							}
						>
							{translate("timeline.clipEdit.undoTrim", "Undo trim")}
						</Button>
					</li>
				))}
			</ul>
			{gaps.length > 1 && (
				<Button
					variant="ghost"
					size="sm"
					className="h-8 self-end text-xs"
					onClick={() => window.dispatchEvent(new CustomEvent(TRIM_RESTORE_ALL_EVENT))}
				>
					{translate("settings.trim.restoreAll", "Undo all trims")}
				</Button>
			)}
		</section>
	);
}
