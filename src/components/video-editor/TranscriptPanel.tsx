import { Label } from "@heroui/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useScopedT } from "@/contexts/I18nContext";
import { SliderControl } from "./SliderControl";
import {
	DEFAULT_PAUSE_KEEP_MS,
	DEFAULT_PAUSE_THRESHOLD_MS,
	findFillerWords,
	findLongPauses,
	listTranscriptWords,
	type SourceRange,
	type TranscriptWord,
	visibleTranscriptWords,
	wordCutRange,
} from "./transcriptEdit";
import type { CaptionCue, ClipRegion } from "./types";

interface TranscriptPanelProps {
	cues: CaptionCue[];
	clipRegions: ClipRegion[];
	onCutSourceRanges: (ranges: SourceRange[]) => boolean;
}

function formatSeconds(ms: number) {
	const total = Math.max(0, ms) / 1000;
	return `${Math.floor(total / 60)}:${(total % 60).toFixed(1).padStart(4, "0")}`;
}

/** Descript-style edit by transcript: delete words to cut them from the video. */
export default function TranscriptPanel({ cues, clipRegions, onCutSourceRanges }: TranscriptPanelProps) {
	const t = useScopedT("settings");
	const words = useMemo(
		() => visibleTranscriptWords(listTranscriptWords(cues), clipRegions),
		[cues, clipRegions],
	);
	const [anchor, setAnchor] = useState<number | null>(null);
	const [focus, setFocus] = useState<number | null>(null);
	const [fillerReview, setFillerReview] = useState<TranscriptWord[] | null>(null);
	const [fillerChecked, setFillerChecked] = useState<Set<string>>(new Set());
	const [pauseThresholdMs, setPauseThresholdMs] = useState(DEFAULT_PAUSE_THRESHOLD_MS);
	const pauses = useMemo(
		() => findLongPauses(words, pauseThresholdMs, DEFAULT_PAUSE_KEEP_MS, clipRegions),
		[words, pauseThresholdMs, clipRegions],
	);

	const selection =
		anchor !== null && focus !== null
			? [Math.min(anchor, focus), Math.max(anchor, focus)]
			: null;

	const cut = (ranges: SourceRange[]) => {
		if (onCutSourceRanges(ranges)) {
			setAnchor(null);
			setFocus(null);
			return true;
		}
		toast.error(t("transcript.cutFailed", "Nothing to cut."));
		return false;
	};

	const deleteSelection = () => {
		if (!selection) return;
		cut([wordCutRange(words, selection[0], selection[1])]);
	};

	const selectSentence = (index: number) => {
		const cueId = words[index].key.split(":")[0];
		const inCue = words.flatMap((word, i) => (word.key.split(":")[0] === cueId ? [i] : []));
		setAnchor(inCue[0]);
		setFocus(inCue[inCue.length - 1]);
	};

	if (cues.length === 0) return null;

	return (
		<div className="flex flex-col gap-3" data-transcript-panel>
			<Label className="text-[13px]">{t("transcript.title", "Transcript")}</Label>
			<p className="text-xs text-muted-foreground">
				{t(
					"transcript.hint",
					"Click a word, Shift-click to extend, double-click for the sentence. Press Delete to cut it from the video.",
				)}
			</p>
			<div
				role="listbox"
				aria-multiselectable
				aria-label={t("transcript.title", "Transcript")}
				tabIndex={0}
				onKeyDown={(event) => {
					if ((event.key === "Delete" || event.key === "Backspace") && selection) {
						event.preventDefault();
						deleteSelection();
					}
					if (event.key === "Escape") {
						setAnchor(null);
						setFocus(null);
					}
				}}
				className="max-h-56 overflow-y-auto rounded-lg bg-foreground/[0.03] px-2.5 py-2 text-sm leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-accent"
			>
				{words.length === 0 ? (
					<span className="text-xs text-muted-foreground">
						{t("transcript.empty", "All words have been cut.")}
					</span>
				) : (
					words.map((word, index) => {
						const selected = selection && index >= selection[0] && index <= selection[1];
						return (
							<span key={word.key}>
								{index > 0 && word.leadingSpace ? " " : ""}
								<span
									role="option"
									aria-selected={Boolean(selected)}
									onClick={(event) => {
										if (event.shiftKey && anchor !== null) setFocus(index);
										else {
											setAnchor(index);
											setFocus(index);
										}
									}}
									onDoubleClick={() => selectSentence(index)}
									className={`cursor-text rounded-sm ${selected ? "bg-accent/40 text-foreground" : "hover:bg-foreground/10"}`}
								>
									{word.text}
								</span>
							</span>
						);
					})
				)}
			</div>
			<Button
				type="button"
				variant="destructive"
				size="sm"
				disabled={!selection}
				onClick={deleteSelection}
				className="h-9 w-full text-xs"
			>
				{t("transcript.deleteSelection", "Delete selected words")}
			</Button>

			{fillerReview ? (
				<div className="flex flex-col gap-2 rounded-lg bg-foreground/[0.03] px-2.5 py-2">
					<span className="text-xs text-muted-foreground">
						{t("transcript.fillerFound", "{{count}} filler words found", {
							count: fillerReview.length,
						})}
					</span>
					<div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
						{fillerReview.map((word) => (
							<label key={word.key} className="flex items-center gap-2 text-xs">
								<input
									type="checkbox"
									className="accent-[var(--accent)]"
									checked={fillerChecked.has(word.key)}
									onChange={(event) => {
										const next = new Set(fillerChecked);
										if (event.target.checked) next.add(word.key);
										else next.delete(word.key);
										setFillerChecked(next);
									}}
								/>
								<span className="font-medium text-foreground">{word.text}</span>
								<span className="ml-auto tabular-nums text-muted-foreground">
									{formatSeconds(word.startMs)}
								</span>
							</label>
						))}
					</div>
					<div className="grid grid-cols-2 gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-9 w-full text-xs"
							onClick={() => setFillerReview(null)}
						>
							{t("transcript.cancel", "Cancel")}
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-9 w-full text-xs"
							disabled={fillerChecked.size === 0}
							onClick={() => {
								const ranges = fillerReview.filter((word) => fillerChecked.has(word.key));
								if (cut(ranges)) setFillerReview(null);
							}}
						>
							{t("transcript.removeCount", "Remove {{count}}", { count: fillerChecked.size })}
						</Button>
					</div>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					className="h-9 w-full px-4 text-sm"
					disabled={words.length === 0}
					onClick={() => {
						const fillers = findFillerWords(words);
						if (fillers.length === 0) {
							toast.info(t("transcript.noFillers", "No filler words found."));
							return;
						}
						setFillerReview(fillers);
						setFillerChecked(new Set(fillers.map((word) => word.key)));
					}}
				>
					{t("transcript.removeFillers", "Remove filler words")}
				</Button>
			)}

			<div className="flex flex-col gap-2">
				<SliderControl
					label={t("transcript.pauseThreshold", "Pauses longer than")}
					value={pauseThresholdMs / 1000}
					min={0.5}
					max={5}
					step={0.1}
					onChange={(value) => setPauseThresholdMs(Math.round(value * 1000))}
					formatValue={(value) => `${value.toFixed(1)}s`}
				/>
				<Button
					type="button"
					variant="outline"
					className="h-9 w-full px-4 text-sm"
					disabled={pauses.length === 0}
					onClick={() => cut(pauses)}
				>
					{t("transcript.tightenPauses", "Tighten {{count}} pauses", { count: pauses.length })}
				</Button>
			</div>
		</div>
	);
}
