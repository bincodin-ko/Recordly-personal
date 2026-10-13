import {
	Gauge,
	MagnifyingGlassPlus as ZoomIn,
	ChatCircle as MessageSquare,
	MusicNotes as Music,
	Scissors,
	SpeakerX,
	SpeakerLow,
	EyeSlash,
	Cursor,
	FilmStrip,
	MagnifyingGlass as LoupeIcon,
	TimerIcon,
} from "@/components/ui/icons";
import type { Span, GetSpanFromDragEvent, GetSpanFromResizeEvent } from "dnd-timeline";
import { useItem, useTimelineContext } from "dnd-timeline";
import { useCallback, useMemo, useRef } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import { useClipActions } from "./core/ClipActionsContext";
import { useTimelinePresentation } from "./core/TimelinePresentation";
import { getRegionDisplaySpan, snapRegionSpan } from "./core/clipPresentation";
import { resolveDragEnd, resolveResizeEnd } from "./dnd/engine";
import { translate } from "@/contexts/I18nContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatClipSpeedLabel } from "../clipSpeedChange";
import { getTimeAtClipSeam, type ClipPresentation } from "./core/clipPresentation";
import { formatPlayheadTime } from "./core/time";
import AudioWaveform from "./components/waveform/AudioWaveform";
import type { AudioPeaksData } from "./core/timelineTypes";
import glassStyles from "./ItemGlass.module.css";

interface ItemProps {
	clipPresentation?: ClipPresentation[];
	sharedLeftGrip?: boolean;
	sharedRightGrip?: boolean;
	displaySpan?: Span;
	embedded?: boolean;
	videoPath?: string | null;
	sourceSpan?: Span;
	id: string;
	span: Span;
	rowId: string;
	disabled?: boolean;
	children: React.ReactNode;
	isSelected?: boolean;
	onSelect?: () => void;
	onDoubleClick?: () => void;
	onSelectId?: (id: string) => void;
	zoomDepth?: number;
	zoomMode?: "auto" | "manual";
	/** Zoom uses Glass Loupe (round lens) instead of zooming the frame. */
	loupe?: boolean;
	/** Zoom block turned off: dimmed and striped, skipped in preview/export. */
	zoomDisabled?: boolean;
	speedValue?: number;
	waveformPeaks?: AudioPeaksData | null;
	waveformSegmentSpan?: Span;
	waveformGain?: number;
	waveformNormalize?: boolean;
	muted?: boolean;
	cursorHidden?: boolean;
	rawCursor?: boolean;
	/** Clip volume below 100% (0..1); shown as a small badge. */
	volumeValue?: number;
	variant?: "zoom" | "trim" | "clip" | "annotation" | "speed" | "audio" | "caption";
	isLoading?: boolean;
	loadingLabel?: string;
}

// Map zoom depth to multiplier labels
const ZOOM_LABELS: Record<number, string> = {
	1: "1.25×",
	2: "1.5×",
	3: "1.8×",
	4: "2.2×",
	5: "3.5×",
	6: "5×",
};

export default function Item({
	clipPresentation: suppliedPresentation,
	id,
	sharedLeftGrip = false,
	sharedRightGrip = false,
	embedded = false,
	span,
	displaySpan: suppliedDisplaySpan,
	rowId,
	disabled = false,
	isSelected = false,
	onSelect,
	onDoubleClick,
	onSelectId,
	zoomDepth = 1,
	zoomMode = "auto",
	loupe = false,
	zoomDisabled = false,
	speedValue,
	waveformPeaks = null,
	waveformSegmentSpan,
	waveformGain = 1,
	waveformNormalize = false,
	muted = false,
	cursorHidden = false,
	rawCursor = false,
	volumeValue,
	variant = "zoom",
	isLoading = false,
	loadingLabel,
	children,
}: ItemProps) {
	const timeline = useTimelineContext();
	const clipActions = useClipActions();
	const presentation = useTimelinePresentation();
	const clipPresentation =
		variant === "clip" ? undefined : (suppliedPresentation ?? presentation.clips);
	const displaySpan = clipPresentation?.length
		? getRegionDisplaySpan(span, clipPresentation)
		: (suppliedDisplaySpan ?? span);
	const nodeRef = useRef<HTMLDivElement | null>(null);
	const targets = useMemo(
		() => [
			...new Set(
				presentation.regions
					.filter((region) => region.id !== id)
					.flatMap((region) => [region.start, region.end]),
			),
		],
		[presentation.regions, id],
	);
	const snap = (next: Span, edge?: "start" | "end") =>
		snapRegionSpan(next, targets, presentation.clips, timeline.pixelsToValue(1), edge);
	const getMediaSpanFromDrag: GetSpanFromDragEvent = (event) => {
		if (!("delta" in event)) return span;
		const dragged = timeline.getSpanFromDragEvent(event);
		if (!dragged) return null;
		if (clipPresentation) {
			const start = getTimeAtClipSeam(dragged.start, clipPresentation);
			return snap({ start, end: start + span.end - span.start });
		}
		const visualOffset = displaySpan.start - span.start;
		return { start: dragged.start - visualOffset, end: dragged.end - visualOffset };
	};
	const getMediaSpanFromResize: GetSpanFromResizeEvent = (event) => {
		const delta = timeline.pixelsToValue(event.delta.x);
		const edge = event.direction;
		if (clipPresentation)
			return snap(
				{
					...span,
					[edge]: getTimeAtClipSeam(displaySpan[edge] + delta, clipPresentation),
				},
				edge,
			);
		const scale = (span.end - span.start) / (displaySpan.end - displaySpan.start);
		return { ...span, [edge]: span[edge] + delta * scale };
	};

	const paintPreview = (preview: Span, deltaY = 0) => {
		const node = nodeRef.current;
		if (!node || !clipPresentation) return;
		const display = getRegionDisplaySpan(preview, clipPresentation);
		const side = timeline.direction === "rtl" ? "right" : "left";
		node.style[side] = `${timeline.valueToPixels(display.start - timeline.range.start)}px`;
		node.style.width = `${timeline.valueToPixels(display.end - display.start)}px`;
		node.style.transform = deltaY ? `translateY(${deltaY}px)` : "none";
	};
	const { previewConfig } = presentation;
	useDndMonitor({
		onDragMove(event) {
			if (event.active.id !== id || !clipPresentation) return;
			const next = getMediaSpanFromDrag(event);
			if (next) {
				const resolved = resolveDragEnd(id, next, rowId, previewConfig);
				paintPreview(resolved?.span ?? span, event.delta.y);
			}
		},
		onDragEnd(event) {
			if (event.active.id === id) paintPreview(span);
		},
		onDragCancel(event) {
			if (event.active.id === id) paintPreview(span);
		},
	});
	const { setNodeRef, attributes, listeners, itemStyle, itemContentStyle } = useItem({
		id,
		span: displaySpan,
		disabled: disabled || isLoading,
		data: {
			rowId,
			span,
			getSpanFromDragEvent: getMediaSpanFromDrag,
			getSpanFromResizeEvent: getMediaSpanFromResize,
		},
		resizeHandleWidth: variant === "clip" ? 12 : undefined,
		onResizeMove(event) {
			if (!clipPresentation) return;
			const next = getMediaSpanFromResize(event);
			if (next) {
				const resolved = resolveResizeEnd(id, next, previewConfig);
				if (resolved) paintPreview(resolved);
			}
		},
	});

	const attachRef = useCallback(
		(node: HTMLDivElement | null) => {
			nodeRef.current = node;
			setNodeRef(node);
		},
		[setNodeRef],
	);
	const timeLabel = useMemo(
		() => `${formatPlayheadTime(span.start)} – ${formatPlayheadTime(span.end)}`,
		[span.start, span.end],
	);

	if (isLoading) {
		return (
			<div
				ref={attachRef}
				style={{
					...itemStyle,
					height: "100%",
					display: "flex",
					alignItems: "center",
				}}
				{...listeners}
				{...attributes}
				data-timeline-item="true"
				data-variant={variant}
				data-start-ms={span.start}
				data-end-ms={span.end}
				onMouseDownCapture={(event) => event.stopPropagation()}
				onClickCapture={(event) => event.stopPropagation()}
			>
				<Skeleton
					animationType="shimmer"
					aria-label={loadingLabel || "Loading..."}
					className="w-full"
					style={{ height: "85%", minHeight: 22 }}
				/>
			</div>
		);
	}

	const isZoom = variant === "zoom";
	const isTrim = variant === "trim";
	const isClip = variant === "clip";
	const isSpeed = variant === "speed";
	const isAudio = variant === "audio";
	const isCaption = variant === "caption";
	const showAudioWaveform = isAudio && Boolean(waveformPeaks);
	const clipSpeedLabel = isClip ? formatClipSpeedLabel(speedValue ?? 1) : null;
	const clipDurationMs = span.end - span.start;
	const clipSeconds = Math.max(1, Math.round(clipDurationMs / 1000));
	const clipDurationLabel =
		clipSeconds >= 60
			? translate("timeline.item.minSec", "{{m}}m {{s}}s", {
					m: Math.floor(clipSeconds / 60),
					s: clipSeconds % 60,
				})
			: translate("timeline.item.sec", "{{s}}s", { s: clipSeconds });
	const clipSpeedText = `${speedValue ?? 1}×`;

	const glassClass = isZoom
		? glassStyles.glassZoom
		: isTrim
			? glassStyles.glassRed
			: isClip
				? glassStyles.glassClip
				: isSpeed
					? glassStyles.glassAmber
					: isAudio
						? glassStyles.glassDarkGreen
						: isCaption
							? glassStyles.glassCaption
							: glassStyles.glassYellow;

	const MIN_ITEM_PX = 6;
	const handleSelect = () => {
		onSelect?.();
		onSelectId?.(id);
	};
	const safeItemStyle = {
		...itemStyle,
		minWidth: MIN_ITEM_PX,
		height: "100%",
		overflow: isClip ? "visible" : "hidden",
		pointerEvents: "auto" as const,
	};

	return (
		<div
			ref={attachRef}
			style={safeItemStyle}
			{...listeners}
			{...attributes}
			data-timeline-item="true"
			data-variant={variant}
			data-zoom-disabled={zoomDisabled || undefined}
			data-start-ms={span.start}
			data-end-ms={span.end}
			aria-label={
				isClip
					? `Clip${clipSpeedLabel ? ` ${clipSpeedLabel}` : ""} · ${timeLabel}`
					: undefined
			}
			onPointerDownCapture={handleSelect}
			onContextMenu={(event) => {
				if (!clipActions || (variant !== "clip" && variant !== "zoom")) return;
				event.preventDefault();
				event.stopPropagation();
				if (variant === "zoom") clipActions.openZoomMenu(id, event.clientX, event.clientY);
				else clipActions.openClipMenu(id, event.clientX, event.clientY);
			}}
			onDoubleClick={(event) => {
				if (!onDoubleClick) return;
				event.stopPropagation();
				onDoubleClick();
			}}
			className="group h-full"
		>
			<div
				className="h-full"
				style={{
					...itemContentStyle,
					overflow: isClip ? "visible" : "hidden",
					minWidth: MIN_ITEM_PX,
					height: "100%",
					display: "flex",
					alignItems: "center",
				}}
			>
				<div
					className={cn(
						glassClass,
						"timeline-block w-full flex items-center justify-center gap-1.5 relative",
						isSelected && glassStyles.selected,
						zoomDisabled && glassStyles.zoomDisabled,
						embedded && glassStyles.embeddedCaption,
						isClip ? "overflow-visible" : "overflow-hidden",
					)}
					style={{
						height: "85%",
						minHeight: embedded ? 18 : 22,
						minWidth: MIN_ITEM_PX,
						containerType: "size",
					}}
					onClick={(event) => {
						event.stopPropagation();
					}}
				>
					<div
						className={cn(
							glassStyles.zoomEndCap,
							glassStyles.left,
							isClip && glassStyles.clipHandle,
						)}
						style={{
							cursor: "col-resize",
							pointerEvents: isClip ? "none" : "auto",
							display: isClip && sharedLeftGrip ? "none" : undefined,
						}}
						title={translate("timeline.item.resizeLeft", "Resize left")}
					/>
					<div
						className={cn(
							glassStyles.zoomEndCap,
							glassStyles.right,
							isClip && glassStyles.clipHandle,
						)}
						style={{
							cursor: "col-resize",
							pointerEvents: isClip ? "none" : "auto",
							display: isClip && sharedRightGrip ? "none" : undefined,
						}}
						title={translate("timeline.item.resizeRight", "Resize right")}
					/>
					{(showAudioWaveform || (isClip && waveformPeaks)) && waveformPeaks && (
						<AudioWaveform
							peaks={waveformPeaks}
							segmentStartMs={waveformSegmentSpan?.start ?? span.start}
							segmentEndMs={waveformSegmentSpan?.end ?? span.end}
							gain={waveformGain}
							normalize={waveformNormalize}
							className={cn(
								"absolute inset-0 w-full h-full pointer-events-none",
								isClip ? "opacity-30" : "opacity-45",
							)}
						/>
					)}
					{/* Muted overlay for source audio track items */}
					{isAudio && muted && (
						<div className="absolute inset-0 z-20 flex items-center justify-center gap-1 bg-red-900/40 pointer-events-none">
							<SpeakerX className="w-3 h-3 text-red-300/90 shrink-0" />
						</div>
					)}
					{isClip && cursorHidden && (
						<div
							className="absolute left-1 top-1 z-20 flex items-center rounded bg-black/65 p-0.5 pointer-events-none"
							title={translate("timeline.item.cursorHidden", "Cursor hidden")}
						>
							<EyeSlash className="w-3 h-3 text-white/90 shrink-0" />
						</div>
					)}
					{isClip && rawCursor && (
						<div
							data-testid="clip-raw-cursor-badge"
							className={cn(
								"absolute top-1 z-20 flex items-center rounded bg-black/65 p-0.5 pointer-events-none",
								cursorHidden ? "left-6" : "left-1",
							)}
							title={translate("timeline.item.rawCursor", "Smooth cursor off")}
						>
							<Cursor className="w-3 h-3 text-white/90 shrink-0" />
						</div>
					)}
					{isClip && volumeValue !== undefined && (
						<div
							data-testid="clip-volume-badge"
							className="absolute right-1 top-1 z-20 flex items-center gap-0.5 rounded bg-black/65 px-1 py-0.5 text-[10px] font-medium text-white/90 pointer-events-none"
						>
							{volumeValue <= 0 ? (
								<SpeakerX className="w-3 h-3 shrink-0" />
							) : (
								<SpeakerLow className="w-3 h-3 shrink-0" />
							)}
							{volumeValue > 0 && `${Math.round(volumeValue * 100)}%`}
						</div>
					)}
					{isClip && (
						<div
							data-testid="clip-band-label"
							className="absolute inset-x-0 top-1 z-10 flex flex-col items-center gap-px text-[11px] leading-[13px] text-white/90 select-none pointer-events-none overflow-hidden px-2"
						>
							<span className="flex items-center gap-1 font-medium opacity-80">
								<FilmStrip aria-hidden="true" className="size-3 shrink-0" />
								{translate("timeline.item.clip", "Clip")}
							</span>
							<span className="flex items-center gap-1 whitespace-nowrap">
								{clipDurationLabel} · <TimerIcon aria-hidden="true" className="size-3 shrink-0" />
								{clipSpeedText}
							</span>
						</div>
					)}
					{!isClip && (
						<div
							title={`${isZoom ? `${ZOOM_LABELS[zoomDepth]} ${zoomMode === "manual" ? translate("timeline.item.manual", "Manual") : translate("timeline.item.auto", "Auto")}` : typeof children === "string" ? children : translate("timeline.item.clip", "Clip")} · ${timeLabel}`}
							className={cn(
								"relative z-10 flex max-w-full items-center justify-center gap-1 px-1 text-[11px] font-medium text-black/70 dark:text-white/90 select-none overflow-hidden",
								(isZoom || embedded) && "text-white dark:text-white",
								embedded && "w-full justify-start px-2",
							)}
						>
							{isZoom ? (
								<span className="flex flex-col items-center gap-px leading-[12px]">
									<span className="flex items-center gap-1 opacity-80">
										<ZoomIn aria-hidden="true" className="size-3 shrink-0" />
										{translate("timeline.item.zoom", "Zoom")}
									</span>
									<span className="zoom-value flex items-center gap-1 whitespace-nowrap">
										<LoupeIcon aria-hidden="true" className="zoom-icon size-3 shrink-0" />
										{ZOOM_LABELS[zoomDepth] || `${zoomDepth}×`} ·{" "}
										{zoomMode === "manual"
											? translate("timeline.item.manual", "Manual")
											: translate("timeline.item.auto", "Auto")}
										{zoomDisabled && (
											<span
												data-testid="zoom-off-badge"
												className="ml-0.5 inline-flex items-center rounded-full bg-black/40 px-1 text-[9px] font-semibold"
											>
												{translate("timeline.item.off", "Off")}
											</span>
										)}
										{loupe && (
											<span
												data-testid="zoom-loupe-badge"
												title={translate("timeline.item.loupe", "Glass Loupe")}
												className="ml-0.5 inline-flex items-center rounded-full bg-white/25 px-1 text-[9px] font-semibold"
											>
												{translate("timeline.item.loupeShort", "Loupe")}
											</span>
										)}
									</span>
								</span>
							) : embedded ? (
								<span className="truncate">{children}</span>
							) : (
								<>
									{isTrim ? (
										<Scissors className="size-3 shrink-0" />
									) : isSpeed ? (
										<Gauge className="size-3 shrink-0" />
									) : isAudio ? (
										<Music className="size-3 shrink-0" />
									) : (
										<MessageSquare className="size-3 shrink-0" />
									)}
									<span className="truncate">
										{isTrim ? translate("timeline.item.trim", "Trim") : isSpeed ? `${speedValue}×` : children}
									</span>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
