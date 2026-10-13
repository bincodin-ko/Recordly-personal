import { useTimelineContext } from "dnd-timeline";
import { useEffect, useRef, useState } from "react";
import { translate } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import {
	type CameraLayoutKind,
	type CameraLayoutRegion,
	sortCameraLayoutRegions,
} from "../cameraLayout";
import { getRegionDisplaySpan, getTimeAtClipSeam } from "./core/clipPresentation";
import { useTimelinePresentation } from "./core/TimelinePresentation";
import Row from "./Row";

export const CAMERA_LAYOUT_ROW_ID = "row-camera-layout";
const NEW_LAYOUT_MS = 3000;
const MIN_LAYOUT_MS = 300;
const EDGE_PX = 6;

const LAYOUT_OPTIONS: CameraLayoutKind[] = ["fullscreen", "split", "cutout", "default", "hidden"];

export function getCameraLayoutLabel(layout: CameraLayoutKind): string {
	switch (layout) {
		case "fullscreen":
			return translate("timeline.cameraLayout.fullscreen", "Camera fullscreen");
		case "split":
			return translate("timeline.cameraLayout.split", "Split screen");
		case "cutout":
			return translate("timeline.cameraLayout.cutout", "Cutout");
		case "hidden":
			return translate("timeline.cameraLayout.hidden", "Camera hidden");
		default:
			return translate("timeline.cameraLayout.default", "Default");
	}
}

const BLOCK_COLORS: Record<CameraLayoutKind, string> = {
	fullscreen: "bg-[#7c3aed]/80 border-[#a78bfa]/60",
	split: "bg-[#0e7490]/80 border-[#67e8f9]/50",
	cutout: "bg-[#be185d]/80 border-[#f9a8d4]/50",
	default: "bg-[#3f3f46] border-white/20",
	hidden: "bg-[#27272a] border-dashed border-white/30",
};

interface Props {
	regions: CameraLayoutRegion[];
	durationMs: number;
	direction: string;
	onChange: (regions: CameraLayoutRegion[]) => void;
}

type Drag = { id: string; mode: "move" | "start" | "end"; x: number; start: number; end: number };

/**
 * Screen Studio's Layouts timeline: click an empty spot to add a layout (camera
 * fullscreen first, like Screen Studio), click a block to pick its layout or delete it,
 * drag the body to move and the edges to resize.
 */
export default function CameraLayoutTrackRow({ regions, durationMs, direction, onChange }: Props) {
	const {
		valueToPixels,
		pixelsToValue,
		range: { start: rangeStart },
	} = useTimelineContext();
	const { clips } = useTimelinePresentation();
	const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
	const dragRef = useRef<Drag | null>(null);
	const movedRef = useRef(false);
	const sorted = sortCameraLayoutRegions(regions);
	const rtl = direction === "rtl";

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

	const timeAtClientX = (element: HTMLElement, clientX: number) => {
		const rect = element.getBoundingClientRect();
		const px = rtl ? rect.right - clientX : clientX - rect.left;
		return getTimeAtClipSeam(rangeStart + pixelsToValue(px), clips);
	};

	const neighbours = (id: string) => {
		const index = sorted.findIndex((r) => r.id === id);
		return {
			min: index > 0 ? sorted[index - 1].endMs : 0,
			max: index >= 0 && index < sorted.length - 1 ? sorted[index + 1].startMs : durationMs,
		};
	};

	const addAt = (timeMs: number, anchor: { x: number; y: number }) => {
		if (sorted.some((r) => timeMs >= r.startMs && timeMs < r.endMs)) return;
		const next = sorted.find((r) => r.startMs > timeMs);
		const endMs = Math.min(timeMs + NEW_LAYOUT_MS, next?.startMs ?? durationMs, durationMs);
		if (endMs - timeMs < MIN_LAYOUT_MS) return;
		const region: CameraLayoutRegion = {
			id: `layout-${Date.now().toString(36)}`,
			startMs: Math.round(timeMs),
			endMs: Math.round(endMs),
			layout: "fullscreen",
		};
		onChange([...sorted, region]);
		setMenu({ id: region.id, ...anchor });
	};

	const update = (id: string, patch: Partial<CameraLayoutRegion>) =>
		onChange(sorted.map((r) => (r.id === id ? { ...r, ...patch } : r)));
	const remove = (id: string) => onChange(sorted.filter((r) => r.id !== id));

	const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		const dxPx = (rtl ? -1 : 1) * (event.clientX - drag.x);
		if (Math.abs(dxPx) > 2) movedRef.current = true;
		if (!movedRef.current) return;
		const delta = pixelsToValue(Math.abs(dxPx)) * Math.sign(dxPx);
		const { min, max } = neighbours(drag.id);
		const length = drag.end - drag.start;
		if (drag.mode === "move") {
			const start = Math.min(Math.max(min, drag.start + delta), max - length);
			update(drag.id, { startMs: Math.round(start), endMs: Math.round(start + length) });
		} else if (drag.mode === "start") {
			const start = Math.min(Math.max(min, drag.start + delta), drag.end - MIN_LAYOUT_MS);
			update(drag.id, { startMs: Math.round(start) });
		} else {
			const end = Math.max(Math.min(max, drag.end + delta), drag.start + MIN_LAYOUT_MS);
			update(drag.id, { endMs: Math.round(end) });
		}
	};

	const stop = (event: React.SyntheticEvent) => event.stopPropagation();
	const menuRegion = menu ? sorted.find((r) => r.id === menu.id) : null;

	return (
		<Row
			id={CAMERA_LAYOUT_ROW_ID}
			isEmpty={sorted.length === 0}
			hint={translate("timeline.cameraLayout.hint", "Click to add a camera layout")}
			onMouseDown={stop}
			onClick={(event) => {
				event.stopPropagation();
				if ((event.target as Element).closest("[data-camera-layout-block]")) return;
				addAt(timeAtClientX(event.currentTarget, event.clientX), {
					x: event.clientX,
					y: event.clientY,
				});
			}}
		>
			{sorted.map((region) => {
				const span = getRegionDisplaySpan({ start: region.startMs, end: region.endMs }, clips);
				const width = Math.max(12, valueToPixels(span.end - span.start));
				return (
					<button
						key={region.id}
						type="button"
						data-camera-layout-block
						data-testid="timeline-camera-layout-block"
						title={getCameraLayoutLabel(region.layout)}
						className={cn(
							"absolute top-1/2 -translate-y-1/2 h-[80%] overflow-hidden whitespace-nowrap rounded-md border px-2 text-left text-[10px] font-semibold leading-none text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60",
							BLOCK_COLORS[region.layout],
							menu?.id === region.id && "ring-2 ring-white/70",
						)}
						style={{
							[rtl ? "right" : "left"]: valueToPixels(span.start - rangeStart),
							width,
							cursor: "grab",
						}}
						onMouseDown={stop}
						onPointerDown={(event) => {
							event.stopPropagation();
							const rect = event.currentTarget.getBoundingClientRect();
							const offset = rtl ? rect.right - event.clientX : event.clientX - rect.left;
							const mode = offset <= EDGE_PX ? "start" : offset >= rect.width - EDGE_PX ? "end" : "move";
							dragRef.current = { id: region.id, mode, x: event.clientX, start: region.startMs, end: region.endMs };
							movedRef.current = false;
							try {
								event.currentTarget.setPointerCapture(event.pointerId);
							} catch {
								// Synthetic pointers can't be captured; dragging still works over the block.
							}
						}}
						onPointerMove={(event) => {
							if (!dragRef.current) {
								const rect = event.currentTarget.getBoundingClientRect();
								const offset = event.clientX - rect.left;
								event.currentTarget.style.cursor =
									offset <= EDGE_PX || offset >= rect.width - EDGE_PX ? "ew-resize" : "grab";
								return;
							}
							onPointerMove(event);
						}}
						onPointerUp={() => {
							dragRef.current = null;
						}}
						onClick={(event) => {
							event.stopPropagation();
							if (movedRef.current) return;
							setMenu({ id: region.id, x: event.clientX, y: event.clientY });
						}}
						onKeyDown={(event) => {
							if (event.key === "Delete" || event.key === "Backspace") {
								event.preventDefault();
								event.stopPropagation();
								remove(region.id);
								setMenu(null);
							}
						}}
					>
						{width > 40 ? getCameraLayoutLabel(region.layout) : null}
					</button>
				);
			})}
			{menu && menuRegion && (
				<div
					role="menu"
					data-testid="camera-layout-menu"
					className="fixed z-[200] min-w-[180px] -translate-y-full rounded-lg border border-white/10 bg-[#1f1f23] p-1 text-xs text-white shadow-xl"
					style={{ left: menu.x, top: menu.y - 8 }}
					onMouseDown={stop}
					onClick={stop}
				>
					{LAYOUT_OPTIONS.map((layout) => (
						<button
							key={layout}
							type="button"
							role="menuitemradio"
							aria-checked={menuRegion.layout === layout}
							className={cn(
								"flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/10",
								menuRegion.layout === layout && "bg-white/10",
							)}
							onClick={() => {
								update(menuRegion.id, { layout });
								setMenu(null);
							}}
						>
							<span>{getCameraLayoutLabel(layout)}</span>
							{menuRegion.layout === layout ? <span aria-hidden>✓</span> : null}
						</button>
					))}
					<div className="my-1 h-px bg-white/10" />
					<button
						type="button"
						role="menuitem"
						className="w-full rounded-md px-2 py-1.5 text-left text-red-300 hover:bg-white/10"
						onClick={() => {
							remove(menuRegion.id);
							setMenu(null);
						}}
					>
						{translate("timeline.cameraLayout.delete", "Delete layout")}
					</button>
				</div>
			)}
		</Row>
	);
}
