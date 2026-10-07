import { useTimelineContext } from "dnd-timeline";
import { useEffect, useState } from "react";
import { translate } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { getRegionDisplaySpan } from "./core/clipPresentation";
import { SHORTCUT_ROW_ID } from "./core/constants";
import { useTimelinePresentation } from "./core/TimelinePresentation";
import type { TimelineShortcutBlock } from "./core/timelineTypes";
import Row from "./Row";

interface ShortcutTrackRowProps {
	blocks: TimelineShortcutBlock[];
	direction: string;
	/** Switch shortcuts (by sample time) off or back on. */
	onDisabledChange?: (times: number[], disabled: boolean) => void;
}

type MenuState = { x: number; y: number; label: string; disabled: boolean };

/**
 * Screen Studio's shortcuts timeline: one block per detected shortcut.
 * Click toggles it; right-click offers disable/enable all of the same combo.
 */
export default function ShortcutTrackRow({ blocks, direction, onDisabledChange }: ShortcutTrackRowProps) {
	const {
		valueToPixels,
		range: { start: rangeStart },
	} = useTimelineContext();
	const { clips } = useTimelinePresentation();
	const [menu, setMenu] = useState<MenuState | null>(null);

	useEffect(() => {
		if (!menu) return;
		const close = () => setMenu(null);
		window.addEventListener("mousedown", close);
		window.addEventListener("blur", close);
		return () => {
			window.removeEventListener("mousedown", close);
			window.removeEventListener("blur", close);
		};
	}, [menu]);

	const stop = (event: React.SyntheticEvent) => event.stopPropagation();

	return (
		<Row id={SHORTCUT_ROW_ID} isEmpty={blocks.length === 0}>
			{blocks.map((block) => {
				const span = getRegionDisplaySpan({ start: block.start, end: block.end }, clips);
				return (
					<button
						key={block.timeMs}
						type="button"
						data-testid="timeline-shortcut-block"
						aria-pressed={!block.disabled}
						title={block.label}
						className={cn(
							"absolute top-1/2 -translate-y-1/2 h-[80%] min-w-[18px] overflow-hidden whitespace-nowrap rounded-md border px-1.5 text-[10px] font-semibold leading-none transition-colors",
							block.disabled
								? "border-dashed border-foreground/25 bg-foreground/[0.04] text-foreground/40 line-through"
								: "border-white/20 bg-[#3a3a40] text-white hover:bg-[#4a4a52]",
						)}
						style={{
							[direction === "rtl" ? "right" : "left"]: valueToPixels(span.start - rangeStart),
							width: Math.max(18, valueToPixels(span.end - span.start)),
						}}
						onMouseDown={stop}
						onClick={(event) => {
							event.stopPropagation();
							onDisabledChange?.([block.timeMs], !block.disabled);
						}}
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setMenu({
								x: event.clientX,
								y: event.clientY,
								label: block.label,
								disabled: block.disabled,
							});
						}}
					>
						{block.label}
					</button>
				);
			})}
			{menu && (
				<div
					role="menu"
					className="fixed z-[200] min-w-[180px] rounded-lg border border-white/10 bg-[#1f1f23] p-1 text-xs text-white shadow-xl"
					style={{ left: menu.x, top: menu.y }}
					onMouseDown={stop}
					onClick={stop}
				>
					<button
						type="button"
						role="menuitem"
						className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
						onClick={() => {
							const times = blocks
								.filter((block) => block.label === menu.label)
								.map((block) => block.timeMs);
							onDisabledChange?.(times, !menu.disabled);
							setMenu(null);
						}}
					>
						{menu.disabled
							? translate("timeline.shortcuts.enableAll", 'Enable all "{{label}}" shortcuts', {
									label: menu.label,
								})
							: translate("timeline.shortcuts.disableAll", 'Disable all "{{label}}" shortcuts', {
									label: menu.label,
								})}
					</button>
				</div>
			)}
		</Row>
	);
}
