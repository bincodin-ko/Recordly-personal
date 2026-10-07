import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
	CaretDown,
	ChatCircle,
	Check,
	DotsThree,
	Heart,
	MusicNotes,
	ShareNetwork,
	Smartphone,
	UserCircle,
	Crop,
	MagicWand,
	MagnifyingGlassPlus,
	Pause,
	Play,
	Plus,
	Scissors,
	SkipBack,
	SkipForward,
	SpeakerHigh,
	SpeakerLow,
	SpeakerX,
} from "@/components/ui/icons";
import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useI18n } from "@/contexts/I18nContext";
import { ASPECT_RATIOS, type AspectRatio, getAspectRatioLabel } from "@/utils/aspectRatioUtils";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { CaptionEditTarget } from "../captionEditing";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { EditorVideoPreview } from "./EditorVideoPreview";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	videoPath: string | null;
	previewVersion: number;
	aspectRatio: AspectRatio;
	setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
	previewAspectRatioValue: number;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	timelineRef: RefObject<TimelineEditorHandle | null>;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	setPreviewVolume: Dispatch<SetStateAction<number>>;
	suspendRendering: boolean;
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	effectiveCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	effectiveShowCursor: boolean;
	isCropped: boolean;
	handleOpenCropEditor: () => void;
	handleSaveAutoCaptionEdit: (target: CaptionEditTarget, text: string) => void;
	handleSelectAnnotation: (id: string | null) => void;
	setDuration: Dispatch<SetStateAction<number>>;
	isPreviewReady: boolean;
	setIsPreviewReady: Dispatch<SetStateAction<boolean>>;
	setCurrentTime: Dispatch<SetStateAction<number>>;
	setIsPlaying: Dispatch<SetStateAction<boolean>>;
	setError: (message: string | null) => void;
};

/** Screen Studio "Reel mode": Instagram/TikTok UI drawn over the preview only (never exported). */
function ReelModeOverlay() {
	const side = [
		<Heart key="like" weight="fill" className="size-6" />,
		<ChatCircle key="comment" weight="fill" className="size-6" />,
		<ShareNetwork key="share" weight="fill" className="size-6" />,
		<DotsThree key="more" weight="bold" className="size-6" />,
	];
	return (
		<div
			className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit] text-white"
			data-testid="reel-mode-overlay"
		>
			<div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/40 to-transparent px-[5%] pb-6 pt-[4%] text-[13px] font-semibold">
				<span>Reels</span>
			</div>
			<div className="absolute bottom-[18%] right-[3%] flex flex-col items-center gap-4 drop-shadow">
				{side}
			</div>
			<div className="absolute inset-x-0 bottom-0 h-[24%] bg-gradient-to-t from-black/55 to-transparent" />
			<div className="absolute bottom-[4%] left-[4%] right-[20%] flex flex-col gap-1.5 text-[12px] drop-shadow">
				<div className="flex items-center gap-2 font-semibold">
					<UserCircle weight="fill" className="size-6" />
					<span>your_account</span>
					<span className="rounded border border-white/70 px-1.5 text-[0.85em]">Follow</span>
				</div>
				<div className="h-2 w-3/4 rounded-full bg-white/70" />
				<div className="flex items-center gap-1.5 opacity-90">
					<MusicNotes className="size-3.5" />
					<div className="h-1.5 w-1/2 rounded-full bg-white/60" />
				</div>
			</div>
		</div>
	);
}

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function EditorPreviewPanel(props: Props) {
	const {
		t,
		videoPath,
		previewVersion,
		aspectRatio,
		setAspectRatio,
		previewAspectRatioValue,
		videoPlaybackRef,
		timelineRef,
		currentTime,
		isPlaying,
		previewVolume,
		setPreviewVolume,
		suspendRendering,
		appearance,
		timeline,
		audio,
		projection,
		playback,
		zoomCommands,
		annotationCommands,
		effectiveCursorTelemetry,
		effectiveShowCursor,
		isCropped,
		handleOpenCropEditor,
		handleSaveAutoCaptionEdit,
		handleSelectAnnotation,
		setDuration,
		isPreviewReady,
		setIsPreviewReady,
		setCurrentTime,
		setIsPlaying,
		setError,
	} = props;

	// Reel mode switches the output to 9:16 (so export matches) and overlays reel UI.
	const [reelMode, setReelMode] = useState(false);
	const aspectBeforeReelRef = useRef<AspectRatio | null>(null);
	const showReelOverlay = reelMode && aspectRatio === "9:16";
	const toggleReelMode = () => {
		if (showReelOverlay) {
			setReelMode(false);
			if (aspectBeforeReelRef.current) setAspectRatio(aspectBeforeReelRef.current);
			aspectBeforeReelRef.current = null;
			return;
		}
		aspectBeforeReelRef.current = aspectRatio === "9:16" ? null : aspectRatio;
		setAspectRatio("9:16");
		setReelMode(true);
	};

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="flex h-10 shrink-0 items-center justify-center gap-3">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
								>
									<span className="font-medium">
										{getAspectRatioLabel(aspectRatio)}
									</span>
									<CaretDown className="h-3 w-3" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="center">
								{ASPECT_RATIOS.map((ratio) => (
									<DropdownMenuItem
										key={ratio}
										onClick={() => setAspectRatio(ratio)}
										className="flex cursor-pointer items-center justify-between gap-3 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
									>
										<span>{getAspectRatioLabel(ratio)}</span>
										{aspectRatio === ratio ? (
											<Check className="h-3 w-3 text-[#2563EB]" />
										) : null}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							variant="ghost"
							size="sm"
							onClick={toggleReelMode}
							aria-pressed={showReelOverlay}
							title={t(
								"editor.preview.reelModeHint",
								"Preview in 9:16 with Instagram/TikTok screen elements",
							)}
							className="h-7 gap-1.5 px-2 text-xs"
						>
							<Smartphone className="h-3.5 w-3.5" />
							<span className="font-medium">
								{t("editor.preview.reelMode", "Reel mode")}
							</span>
							{showReelOverlay ? (
								<span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
							) : null}
						</Button>
						<div className="h-4 w-px bg-foreground/20" />
						<Button
							variant="ghost"
							size="sm"
							onClick={handleOpenCropEditor}
							className="h-7 gap-1.5 px-2 text-xs"
						>
							<Crop className="h-3.5 w-3.5" />
							<span className="font-medium">{t("settings.crop.title")}</span>
							{isCropped ? (
								<span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
							) : null}
						</Button>
					</div>
					<div
						className="flex min-h-0 w-full flex-1 items-stretch px-4 py-3"
						style={{ flex: "1 1 auto", margin: 0 }}
					>
						<div
							className="editor-preview-stage flex min-h-0 min-w-0 flex-1 items-center justify-center"
							style={{ containerType: "size" }}
						>
							<div
								className="editor-preview-frame relative"
								style={{
									width: `min(100cqw, calc(100cqh * ${previewAspectRatioValue}))`,
									height: `min(100cqh, calc(100cqw / ${previewAspectRatioValue}))`,
									aspectRatio: previewAspectRatioValue,
									maxWidth: "100%",
									margin: "0 auto",
									boxSizing: "border-box",
								}}
							>
								{videoPath && !isPreviewReady && (
									<Skeleton
										aria-label={t("editor.preview.loadingPreview", "Loading preview")}
										className="pointer-events-none absolute inset-0 z-20 h-full w-full rounded-xl"
									/>
								)}
								<EditorVideoPreview
									videoPath={videoPath}
									previewVersion={previewVersion}
									aspectRatio={aspectRatio}
									playbackRef={videoPlaybackRef}
									currentTime={currentTime}
									isPlaying={isPlaying}
									previewVolume={previewVolume}
									suspendRendering={suspendRendering}
									appearance={appearance}
									timeline={timeline}
									audio={audio}
									effectiveZoomRegions={projection.effectiveZoomRegions}
									effectiveCursorTelemetry={effectiveCursorTelemetry}
									effectiveShowCursor={effectiveShowCursor}
									setDuration={setDuration}
									setIsPreviewReady={setIsPreviewReady}
									setCurrentTime={setCurrentTime}
									setIsPlaying={setIsPlaying}
									setError={setError}
									handlers={{
										onSelectZoom: zoomCommands.handleSelectZoom,
										onZoomFocusChange: zoomCommands.handleZoomFocusChange,
										onEditAutoCaption: handleSaveAutoCaptionEdit,
										onSelectAnnotation: handleSelectAnnotation,
										onAnnotationPositionChange:
											annotationCommands.handleAnnotationPositionChange,
										onAnnotationSizeChange:
											annotationCommands.handleAnnotationSizeChange,
									}}
								/>
								{showReelOverlay ? <ReelModeOverlay /> : null}
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="editor-playback relative grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4">
				<div className="editor-playback-tools z-10 flex min-w-0 items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="h-9 gap-2 px-3">
								<Plus className="h-3.5 w-3.5" />
								<span className="font-medium">{t("editor.toolbar.addLayer")}</span>
								<CaretDown className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.annotationRegions.length > 0
											? Math.max(
													...timeline.annotationRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addAnnotation(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("timeline.annotation.label")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.audioRegions.length > 0
											? Math.max(
													...timeline.audioRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addAudio(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("timeline.audio.label")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						onClick={() => timelineRef.current?.addZoom()}
						variant="ghost"
						size="icon"
						className="h-9 w-9"
						title={t("timeline.zoom.addZoom")}
					>
						<MagnifyingGlassPlus className="h-4 w-4" />
					</Button>
					<Button
						onClick={() => timelineRef.current?.suggestZooms()}
						variant="ghost"
						size="icon"
						className="h-9 w-9"
						title={t("timeline.zoom.suggestZooms")}
					>
						<MagicWand className="h-4 w-4" />
					</Button>
					<Button
						onClick={() => timelineRef.current?.splitClip()}
						variant="ghost"
						size="icon"
						className="h-9 w-9"
						title={t("editor.toolbar.splitClip")}
					>
						<Scissors className="h-4 w-4" />
					</Button>
				</div>

				<div className="editor-playback-center z-10 flex items-center justify-center">
					<div className="pointer-events-auto flex items-center gap-1.5">
						<span className="mr-1 text-[10px] font-medium tabular-nums text-muted-foreground">
							{formatTime(projection.timelinePlayheadTime)}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9"
							title={t("editor.playback.skipBack")}
							onClick={playback.handlePreviewSkipBack}
						>
							<SkipBack className="h-3.5 w-3.5" weight="fill" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className={`h-9 w-9  ${isPlaying ? "bg-foreground/10 text-foreground hover:bg-foreground/20" : "bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-white/90"} `}
							onClick={playback.togglePlayPause}
							title={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? (
								<Pause className="h-3.5 w-3.5" weight="fill" />
							) : (
								<Play className="h-3.5 w-3.5" weight="fill" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9"
							title={t("editor.playback.skipForward")}
							onClick={playback.handlePreviewSkipForward}
						>
							<SkipForward className="h-3.5 w-3.5" weight="fill" />
						</Button>
						<span className="ml-1 text-[10px] font-medium tabular-nums text-muted-foreground/70">
							{formatTime(projection.timelineDuration)}
						</span>
					</div>
				</div>

				<div className="editor-playback-volume z-10 ml-auto flex items-center">
					<AudioSyncControl
						t={t}
						onChanged={() => timeline.setSourceAudioFallbackRefreshKey((k) => k + 1)}
					/>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label={t("editor.playback.volume", "Preview volume")}
								title={t("editor.playback.volume", "Preview volume")}
							>
								{previewVolume <= 0.001 ? (
									<SpeakerX className="size-3.5" />
								) : previewVolume < 0.5 ? (
									<SpeakerLow className="size-3.5" />
								) : (
									<SpeakerHigh className="size-3.5" />
								)}
							</Button>
						</PopoverTrigger>
						<PopoverContent
							side="top"
							sideOffset={10}
							aria-label={t("editor.preview.volume", "Preview volume")}
							className="flex w-14 flex-col items-center gap-3 p-3"
						>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{Math.round(previewVolume * 100)}%
							</span>
							<Slider
								aria-label={t("editor.playback.volume", "Preview volume")}
								orientation="vertical"
								min={0}
								max={1}
								step={0.01}
								value={[previewVolume]}
								onValueChange={([value]) => setPreviewVolume(value)}
								className="h-28"
							/>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</div>
	);
}

/** Shift recorded sound vs. picture after recording (saved next to the video). */
function AudioSyncControl({ t, onChanged }: { t: Props["t"]; onChanged: () => void }) {
	const [offsetMs, setOffsetMs] = useState(0);
	useEffect(() => {
		void window.electronAPI?.getAudioSyncOffset?.().then((value) => setOffsetMs(value ?? 0));
	}, []);
	const commit = async (value: number) => {
		setOffsetMs(await window.electronAPI.setAudioSyncOffset(value));
		onChanged();
	};
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 px-2 text-xs tabular-nums"
					title={t("editor.audioSync.title", "Sound sync")}
				>
					{t("editor.audioSync.short", "Sync")} {offsetMs > 0 ? "+" : ""}
					{offsetMs}ms
				</Button>
			</PopoverTrigger>
			<PopoverContent side="top" sideOffset={10} className="flex w-72 flex-col gap-3 p-3">
				<div className="text-xs font-medium">{t("editor.audioSync.title", "Sound sync")}</div>
				<div className="text-[11px] text-muted-foreground">
					{t("editor.audioSync.hint", "+ makes sound later, - makes it earlier.")}
				</div>
				<Slider
					min={-1000}
					max={1000}
					step={5}
					value={[offsetMs]}
					onValueChange={([value]) => setOffsetMs(value)}
					onValueCommit={([value]) => void commit(value)}
				/>
				<div className="flex items-center gap-2">
					{[-50, -10, 10, 50].map((delta) => (
						<Button
							key={delta}
							variant="outline"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => void commit(offsetMs + delta)}
						>
							{delta > 0 ? "+" : ""}
							{delta}
						</Button>
					))}
					<Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => void commit(0)}>
						{t("editor.audioSync.reset", "Reset")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
