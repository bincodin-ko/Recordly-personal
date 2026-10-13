import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Gauge, Keyboard, SpeakerHigh, Trash } from "@/components/ui/icons";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { SliderControl } from "../../SliderControl";
import type { useClipRegionCommands } from "../../hooks/useClipRegionCommands";
import type { RestoreDecision, TrimGap } from "../../trimRestore";
import type { TypingSuggestion } from "../../typingSpeedUp";
import { type ClipRegion, getClipVolume, type ZoomRegion } from "../../types";
import { getPreviewPlaybackRateRange } from "../../videoPlayback/playbackRate";

export type OverlayState =
	| { kind: "menu"; clipId: string; x: number; y: number }
	| { kind: "zoomMenu"; zoomId: string; x: number; y: number }
	| { kind: "typing"; id: string; x: number; y: number }
	| { kind: "restore"; gap: TrimGap; decision: Exclude<RestoreDecision, { kind: "plain" }> };

const SPEED_CHOICES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const VOLUME_CHOICES = [0, 0.25, 0.5, 0.75, 1];

interface Props {
	overlay: OverlayState | null;
	clips: ClipRegion[];
	suggestions: TypingSuggestion[];
	typingSpeed: number;
	onTypingSpeedChange: (speed: number) => void;
	onApplyTyping: (targets: TypingSuggestion[]) => void;
	zoomRegions: ZoomRegion[];
	onToggleZoom: (id: string) => void;
	onClose: () => void;
	commands: ReturnType<typeof useClipRegionCommands>;
	onRestore: (gap: TrimGap, side: "before" | "after" | null) => void;
}

/** Floating card at the pointer; closes on outside press or Escape. */
function FloatingCard({
	x,
	y,
	onClose,
	label,
	children,
}: {
	x: number;
	y: number;
	onClose: () => void;
	label: string;
	children: React.ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ left: x, top: y });
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const rect = node.getBoundingClientRect();
		setPos({
			left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
			top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
		});
	}, [x, y, children]);
	useEffect(() => {
		const onDown = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) onClose();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("pointerdown", onDown, true);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onDown, true);
			window.removeEventListener("keydown", onKey);
		};
	}, [onClose]);
	return (
		<div
			ref={ref}
			role="menu"
			aria-label={label}
			data-testid="clip-floating-card"
			className="fixed z-[200] w-56 rounded-xl border border-foreground/10 bg-editor-surface p-1.5 text-sm text-foreground shadow-2xl"
			style={{ left: pos.left, top: pos.top }}
			onContextMenu={(event) => event.preventDefault()}
		>
			{children}
		</div>
	);
}

function MenuRow({
	icon,
	label,
	value,
	active,
	danger,
	onClick,
}: {
	icon?: React.ReactNode;
	label: string;
	value?: string;
	active?: boolean;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-foreground/10",
				active && "bg-foreground/10 font-semibold",
				danger && "text-red-500",
			)}
		>
			{icon}
			<span className="flex-1 truncate">{label}</span>
			{value && <span className="shrink-0 text-muted-foreground">{value}</span>}
		</button>
	);
}

export function ClipTimelineOverlays({
	overlay,
	clips,
	suggestions,
	typingSpeed,
	onTypingSpeedChange,
	onApplyTyping,
	zoomRegions,
	onToggleZoom,
	onClose,
	commands,
	onRestore,
}: Props) {
	const t = useScopedT("timeline");
	const [page, setPage] = useState<"root" | "speed" | "volume">("root");
	const menuClipId = overlay?.kind === "menu" ? overlay.clipId : null;
	useEffect(() => setPage("root"), [menuClipId]);

	if (!overlay) return null;

	if (overlay.kind === "menu") {
		const clip = clips.find((c) => c.id === overlay.clipId);
		if (!clip) return null;
		const range = getPreviewPlaybackRateRange();
		const speeds = SPEED_CHOICES.filter((s) => s >= range.min && s <= range.max);
		const volume = clip.muted ? 0 : getClipVolume(clip);
		return (
			<FloatingCard
				x={overlay.x}
				y={overlay.y}
				onClose={onClose}
				label={t("clipEdit.menuLabel", "Clip menu")}
			>
				{page === "root" && (
					<>
						<MenuRow
							icon={<Gauge className="size-3.5" />}
							label={t("clipEdit.setSpeed", "Set speed")}
							value={`${clip.speed}×`}
							onClick={() => setPage("speed")}
						/>
						<MenuRow
							icon={<SpeakerHigh className="size-3.5" />}
							label={t("clipEdit.setVolume", "Set volume")}
							value={`${Math.round(volume * 100)}%`}
							onClick={() => setPage("volume")}
						/>
						<div className="my-1 h-px bg-foreground/10" />
						<MenuRow
							icon={<Trash className="size-3.5" />}
							label={t("clipEdit.remove", "Remove")}
							danger
							onClick={() => {
								commands.handleClipDelete(clip.id);
								onClose();
							}}
						/>
					</>
				)}
				{page !== "root" && (
					<>
						<MenuRow
							icon={<ArrowLeft className="size-3.5" />}
							label={
								page === "speed"
									? t("clipEdit.setSpeed", "Set speed")
									: t("clipEdit.setVolume", "Set volume")
							}
							onClick={() => setPage("root")}
						/>
						<div className="my-1 h-px bg-foreground/10" />
						{page === "speed" &&
							speeds.map((speed) => (
								<MenuRow
									key={speed}
									label={speed === 1 ? t("clipEdit.normal", "Normal") : `${speed}×`}
									value={speed === 1 ? "1×" : undefined}
									active={clip.speed === speed}
									onClick={() => {
										commands.setClipSpeedById(clip.id, speed);
										onClose();
									}}
								/>
							))}
						{page === "volume" &&
							VOLUME_CHOICES.map((level) => (
								<MenuRow
									key={level}
									label={
										level === 0
											? t("clipEdit.mute", "Mute")
											: `${Math.round(level * 100)}%`
									}
									active={Math.abs(volume - level) < 0.01}
									onClick={() => {
										commands.setClipVolumeById(clip.id, level);
										onClose();
									}}
								/>
							))}
					</>
				)}
			</FloatingCard>
		);
	}

	if (overlay.kind === "zoomMenu") {
		const zoom = zoomRegions.find((z) => z.id === overlay.zoomId);
		if (!zoom) return null;
		return (
			<FloatingCard
				x={overlay.x}
				y={overlay.y}
				onClose={onClose}
				label={t("zoomEdit.menuLabel", "Zoom menu")}
			>
				<MenuRow
					label={
						zoom.disabled
							? t("zoomEdit.enable", "Turn on")
							: t("zoomEdit.disable", "Turn off")
					}
					onClick={() => {
						onToggleZoom(zoom.id);
						onClose();
					}}
				/>
			</FloatingCard>
		);
	}

	if (overlay.kind === "typing") {
		const suggestion = suggestions.find((s) => s.id === overlay.id);
		if (!suggestion) return null;
		const range = getPreviewPlaybackRateRange();
		const seconds = ((suggestion.endMs - suggestion.startMs) / 1000).toFixed(1);
		return (
			<FloatingCard
				x={overlay.x}
				y={overlay.y}
				onClose={onClose}
				label={t("clipEdit.typingTitle", "Speed up typing")}
			>
				<div className="flex flex-col gap-2 p-1.5">
					<div className="flex items-center gap-2 text-xs font-semibold">
						<Keyboard className="size-3.5" />
						{t("clipEdit.typingTitle", "Speed up typing")}
					</div>
					<p className="text-[11px] text-muted-foreground">
						{t("clipEdit.typingInfo", "Typing for {{seconds}}s ({{count}} keys)", {
							seconds,
							count: suggestion.keyCount,
						})}
					</p>
					<SliderControl
						label={t("clipEdit.typingSpeed", "Speed")}
						value={typingSpeed}
						min={Math.max(1.5, range.min)}
						max={Math.min(10, range.max)}
						step={0.5}
						onChange={onTypingSpeedChange}
						formatValue={(value) => `${value}×`}
					/>
					<Button type="button" size="sm" className="w-full" onClick={() => onApplyTyping([suggestion])}>
						{t("clipEdit.applySuggestion", "Apply suggestion")}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="w-full"
						onClick={() => onApplyTyping(suggestions)}
					>
						{t("clipEdit.applyAll", "Apply all suggestions ({{count}})", {
							count: suggestions.length,
						})}
					</Button>
				</div>
			</FloatingCard>
		);
	}

	const { gap, decision } = overlay;
	const isConflict = decision.kind === "conflict";
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>{t("clipEdit.restoreTitle", "Undo trim")}</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						{isConflict
							? t(
									"clipEdit.restoreConflict",
									"Effects before and after differ. Match the restored part to the previous effects or the next ones?",
								)
							: decision.side === "before"
								? t(
										"clipEdit.restoreBefore",
										"Undoing the trim carries the previous effects into this part. Continue?",
									)
								: t(
										"clipEdit.restoreAfter",
										"Undoing the trim carries the next effects into this part. Continue?",
									)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose}>
						{t("clipEdit.cancel", "Cancel")}
					</Button>
					{isConflict ? (
						<>
							<Button type="button" onClick={() => onRestore(gap, "before")}>
								{t("clipEdit.followBefore", "Follow previous effects")}
							</Button>
							<Button type="button" onClick={() => onRestore(gap, "after")}>
								{t("clipEdit.followAfter", "Follow next effects")}
							</Button>
						</>
					) : (
						<Button type="button" onClick={() => onRestore(gap, decision.side)}>
							{t("clipEdit.confirm", "OK")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
