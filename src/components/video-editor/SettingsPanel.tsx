import { DEFAULT_FRAME_STYLE, FRAME_STYLE_LIMITS, type FrameStyle } from "@/lib/frameStyle";
import {
	CLICK_SOUND_IDS,
	type ClickSoundId,
	type CursorExtrasSettings,
	DEFAULT_CURSOR_EXTRAS,
	playPreviewClickSound,
	type ShortcutOverlayPosition,
} from "./cursorExtras";
import { SettingsSections, SettingsCategory } from "./SettingsSections";
import { Card, RadioGroup, Radio, Label, Description } from "@heroui/react";
import { ProgressBar } from "@heroui/react";
import { ColorControl, ColorPalette } from "@/components/ui/color-picker";
import { MagicWand, Palette, Trash as Trash2, UploadSimple as Upload } from "@/components/ui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCameraAiStatus, subscribeCameraAiStatus } from "./cameraEffects";
import { toast } from "@/components/ui/toast";
import minimalCursorUrl from "@/assets/cursors/custom/minimal-cursor.svg";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ChoiceGroup, ChoiceItem } from "@/components/ui/choice-group";
import { setSettingsSide, useSettingsSide } from "@/lib/settingsSide";
import { useTheme } from "@/contexts/ThemeContext";
import { getAssetPath, getRenderableVideoUrl, getWallpaperThumbnailUrl } from "@/lib/assetPath";
import { cn } from "@/lib/utils";
import type { BuiltInWallpaper } from "@/lib/wallpapers";
import {
	BUILT_IN_WALLPAPERS,
	getAvailableWallpapers,
	isVideoWallpaperSource,
} from "@/lib/wallpapers";
import { type AspectRatio } from "@/utils/aspectRatioUtils";
import { useI18n, useScopedT } from "../../contexts/I18nContext";
import type { AppLocale } from "../../i18n/config";
import { SUPPORTED_LOCALES } from "../../i18n/config";
import { AnnotationSettingsPanel } from "./AnnotationSettingsPanel";
import CaptionListPanel from "./CaptionListPanel";
import TranscriptPanel from "./TranscriptPanel";
import type { SourceRange } from "./transcriptEdit";
import type { CaptionRetimeSpan } from "./captionOps";
import {
	CURSOR_MOTION_PRESETS,
	type CursorMotionPresetId,
	getMatchingCursorMotionPresetId,
} from "./cursorMotionPresets";
import { loadEditorPreferences, saveEditorPreferences } from "./editorPreferences";
import { getDefaultBorderRadiusPercent } from "./projectPersistence";
import { SliderControl } from "./SliderControl";
import { ColorLookControl } from "./ColorLookControl";
import {
	type AudioExtrasSettings,
	BUILTIN_MUSIC_TRACKS,
	DEFAULT_AUDIO_EXTRAS,
	type MicAudioMode,
} from "./audio/audioExtras";
import { type ColorGradingSettings, DEFAULT_COLOR_GRADING } from "@/lib/colorGrading";
import { WallpaperGrid } from "./WallpaperGrid";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { SettingsRow } from "./SettingsRow";
import type {
	AnnotationRegion,
	AnnotationType,
	AutoCaptionAnimation,
	AutoCaptionSettings,
	CaptionCue,
	ClipRegion,
	CropRegion,
	CursorClickEffectStyle,
	CursorStyle,
	EditorEffectSection,
	FigureData,
	Padding,
	WebcamOverlaySettings,
	WebcamPositionPreset,
	WebcamBackgroundStyle,
	ZoomDepth,
	ZoomMode,
	ZoomTransitionEasing,
} from "./types";
import {
	ADVANCED_VERTICAL_PADDING_MAX,
	DEFAULT_AUTO_CAPTION_SETTINGS,
	DEFAULT_CROP_REGION,
	DEFAULT_CURSOR_CLICK_BOUNCE_DURATION,
	DEFAULT_CURSOR_CLICK_EFFECT,
	DEFAULT_CURSOR_CLICK_EFFECT_COLOR,
	DEFAULT_CURSOR_CLICK_EFFECT_DURATION_MS,
	DEFAULT_CURSOR_CLICK_EFFECT_OPACITY,
	DEFAULT_CURSOR_CLICK_EFFECT_SCALE,
	DEFAULT_CURSOR_STYLE,
	DEFAULT_CURSOR_SWAY,
	DEFAULT_PADDING,
	DEFAULT_WEBCAM_MARGIN,
	DEFAULT_WEBCAM_POSITION_PRESET,
	DEFAULT_WEBCAM_POSITION_X,
	DEFAULT_WEBCAM_POSITION_Y,
	DEFAULT_WEBCAM_REACT_TO_ZOOM,
	DEFAULT_WEBCAM_ROUNDNESS,
	DEFAULT_WEBCAM_SHADOW,
	DEFAULT_WEBCAM_SIZE,
	DEFAULT_ZOOM_IN_DURATION_MS,
	DEFAULT_ZOOM_OUT_DURATION_MS,
} from "./types";
import { fromCursorSwaySliderValue, toCursorSwaySliderValue } from "./videoPlayback/cursorSway";
import { isZeroPadding } from "./videoPlayback/layoutUtils";
import { getPreviewPlaybackRateRange } from "./videoPlayback/playbackRate";
import {
	cursorSetAssets,
	getCursorStyleSizeMultiplier,
} from "./videoPlayback/uploadedCursorAssets";
import { WebcamCropControl } from "./WebcamCropControl";
import {
	getCropMatchedWebcamHeightPercent,
	getWebcamPositionForPreset,
	normalizeWebcamCropRegion,
	resolveWebcamCorner,
} from "./webcamOverlay";

const tahoeCursorUrl = cursorSetAssets.tahoe.arrow.url;
const BUILTIN_CURSOR_PREVIEW_SIZE = 28;
const BUILTIN_CURSOR_PREVIEW_FRAME_SIZE = 48;

const GRADIENTS = [
	"linear-gradient( 111.6deg,  rgba(114,167,232,1) 9.4%, rgba(253,129,82,1) 43.9%, rgba(253,129,82,1) 54.8%, rgba(249,202,86,1) 86.3% )",
	"linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
	"radial-gradient( circle farthest-corner at 3.2% 49.6%,  rgba(80,12,139,0.87) 0%, rgba(161,10,144,0.72) 83.6% )",
	"linear-gradient( 111.6deg,  rgba(0,56,68,1) 0%, rgba(163,217,185,1) 51.5%, rgba(231, 148, 6, 1) 88.6% )",
	"linear-gradient( 107.7deg,  rgba(235,230,44,0.55) 8.4%, rgba(252,152,15,1) 90.3% )",
	"linear-gradient( 91deg,  rgba(72,154,78,1) 5.2%, rgba(251,206,70,1) 95.9% )",
	"radial-gradient( circle farthest-corner at 10% 20%,  rgba(2,37,78,1) 0%, rgba(4,56,126,1) 19.7%, rgba(85,245,221,1) 100.2% )",
	"linear-gradient( 109.6deg,  rgba(15,2,2,1) 11.2%, rgba(36,163,190,1) 91.1% )",
	"linear-gradient(135deg, #FBC8B4, #2447B1)",
	"linear-gradient(109.6deg, #F635A6, #36D860)",
	"linear-gradient(90deg, #FF0101, #4DFF01)",
	"linear-gradient(315deg, #EC0101, #5044A9)",
	"linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%)",
	"linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
	"linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
	"linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
	"linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
	"linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)",
	"linear-gradient(to right, #fa709a 0%, #fee140 100%)",
	"linear-gradient(to top, #30cfd0 0%, #330867 100%)",
	"linear-gradient(to top, #c471f5 0%, #fa71cd 100%)",
	"linear-gradient(to right, #f78ca0 0%, #f9748f 19%, #fd868c 60%, #fe9a8b 100%)",
	"linear-gradient(to top, #48c6ef 0%, #6f86d6 100%)",
	"linear-gradient(to right, #0acffe 0%, #495aff 100%)",
];

const CAPTION_ANIMATION_OPTIONS: Array<{ value: AutoCaptionAnimation; label: string }> = [
	{ value: "none", label: "Off" },
	{ value: "fade", label: "Fade" },
	{ value: "rise", label: "Rise" },
	{ value: "pop", label: "Pop" },
];

const CLICK_EFFECT_COLOR_OPTIONS = [
	"#2563EB",
	"#EF4444",
	"#F59E0B",
	"#22C55E",
	"#A855F7",
	"#EC4899",
	"#14B8A6",
	"#F97316",
] as const;

type BackgroundTab = "wallpaper" | "gradient" | "color" | "image";
function isHexWallpaper(value: string): boolean {
	return /^#(?:[0-9a-f]{3}){1,2}$/i.test(value);
}

function hexToRgba(hex: string, alpha: number) {
	const normalized = isHexWallpaper(hex) ? hex : DEFAULT_CURSOR_CLICK_EFFECT_COLOR;
	const value =
		normalized.length === 4
			? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
			: normalized;
	const color = Number.parseInt(value.slice(1), 16);
	const red = (color >> 16) & 255;
	const green = (color >> 8) & 255;
	const blue = color & 255;
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getBackgroundTabForWallpaper(value: string, customImages: string[] = []): BackgroundTab {
	if (GRADIENTS.includes(value)) {
		return "gradient";
	}

	if (isHexWallpaper(value)) {
		return "color";
	}

	// Video wallpapers live at the bottom of the Image tab.
	if (isVideoWallpaperSource(value)) {
		return "image";
	}

	// Uploaded pictures live in the Image tab; everything else is a built-in wallpaper.
	return value.startsWith("data:") || customImages.includes(value) ? "image" : "wallpaper";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <Label className="text-[13px]">{children}</Label>;
}

const MOTION_PRESET_ORDER: CursorMotionPresetId[] = ["focused", "smooth"];

const CURSOR_CLICK_EFFECT_OPTIONS: Array<{
	id: CursorClickEffectStyle;
	label: string;
	description: string;
}> = [
	{
		id: "none",
		label: "Off",
		description: "No click animation. Keeps the pointer steady on every tap.",
	},
	{
		id: "spotlight",
		label: "Spotlight",
		description: "A soft pulse that blooms behind the cursor on click.",
	},
	{
		id: "ripple",
		label: "Ripple",
		description: "Concentric rings that expand from the click point.",
	},
	{
		id: "echo",
		label: "Echo",
		description: "A pair of soft rings that spread outward with a cleaner pulse.",
	},
];

function MotionPresetCards({
	title,
	activePresetId,
	onApply,
	tSettings,
}: {
	title: string;
	activePresetId: CursorMotionPresetId | null;
	onApply: (presetId: CursorMotionPresetId) => void;
	tSettings: (key: string, fallback?: string) => string;
}) {
	return (
		<RadioGroup
			value={activePresetId ?? undefined}
			onChange={(value) => onApply(value as CursorMotionPresetId)}
		>
			<Label className="text-[13px] font-medium">{title}</Label>
			{MOTION_PRESET_ORDER.map((presetId) => (
				<Radio
					key={presetId}
					value={presetId}
					className="rounded-xl border border-separator p-3"
				>
					<Radio.Content>
						<Radio.Control>
							<Radio.Indicator />
						</Radio.Control>
						<div className="flex min-w-0 flex-col gap-1">
							<Label className="text-[13px] font-medium">
								{tSettings(`effects.motionPresets.${presetId}.label`)}
							</Label>
							<Description className="text-xs leading-relaxed">
								{tSettings(`effects.motionPresets.${presetId}.description`)}
							</Description>
						</div>
					</Radio.Content>
				</Radio>
			))}
		</RadioGroup>
	);
}

function CursorClickEffectPreview({
	effect,
	color = DEFAULT_CURSOR_CLICK_EFFECT_COLOR,
}: {
	effect: CursorClickEffectStyle;
	color?: string;
}) {
	return (
		<div
			className="relative flex items-center justify-center"
			style={{
				width: `${BUILTIN_CURSOR_PREVIEW_FRAME_SIZE}px`,
				height: `${BUILTIN_CURSOR_PREVIEW_FRAME_SIZE}px`,
			}}
		>
			{effect === "none" ? (
				<svg
					className="absolute h-10 w-10 text-foreground/40"
					viewBox="0 0 40 40"
					aria-hidden="true"
				>
					<circle
						cx="20"
						cy="20"
						r="11.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						opacity="0.75"
					/>
					<path
						d="M12.5 27.5 27.5 12.5"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="2.2"
						opacity="0.92"
					/>
				</svg>
			) : null}
			{effect === "ripple" ? (
				<svg
					className="absolute h-12 w-12"
					style={{ color }}
					viewBox="0 0 48 48"
					aria-hidden="true"
				>
					<circle
						cx="24"
						cy="24"
						r="13"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						opacity="0.72"
					/>
				</svg>
			) : null}
			{effect === "spotlight" ? (
				<svg
					className="absolute h-12 w-12"
					style={{ color: hexToRgba(color, 0.92) }}
					viewBox="0 0 48 48"
					aria-hidden="true"
				>
					<g fill="none" stroke="currentColor">
						<circle cx="24" cy="24" r="13.5" strokeWidth="1.5" opacity="0.3" />
						<circle cx="24" cy="24" r="9.75" strokeWidth="1.7" opacity="0.56" />
					</g>
				</svg>
			) : null}
			{effect === "echo" ? (
				<svg
					className="absolute h-12 w-12"
					style={{ color: hexToRgba(color, 0.92) }}
					viewBox="0 0 48 48"
					aria-hidden="true"
				>
					<g fill="none" stroke="currentColor">
						<circle cx="24" cy="24" r="9" strokeWidth="1.8" opacity="0.72" />
						<circle cx="24" cy="24" r="14.5" strokeWidth="1.5" opacity="0.4" />
						<circle
							cx="24"
							cy="24"
							r="4.25"
							fill="currentColor"
							opacity="0.22"
							stroke="none"
						/>
					</g>
				</svg>
			) : null}
		</div>
	);
}

function CursorClickEffectCards({
	title,
	activeEffectId,
	effectColor,
	onApply,
	tSettings,
}: {
	title: string;
	activeEffectId: CursorClickEffectStyle;
	effectColor: string;
	onApply: (effectId: CursorClickEffectStyle) => void;
	tSettings: (key: string, fallback?: string) => string;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Label>{title}</Label>
			</div>
			<ChoiceGroup
				type="single"
				value={activeEffectId}
				onValueChange={(value) => {
					if (value) {
						onApply(value as CursorClickEffectStyle);
					}
				}}
				className="grid grid-cols-4 gap-2"
				aria-label={title}
			>
				{CURSOR_CLICK_EFFECT_OPTIONS.map((effect) => {
					const label = tSettings(
						`effects.cursorClickEffects.${effect.id}.label`,
						effect.label,
					);
					const description = tSettings(
						`effects.cursorClickEffects.${effect.id}.description`,
						effect.description,
					);

					return (
						<ChoiceItem
							key={effect.id}
							value={effect.id}
							aria-label={label}
							title={`${label} - ${description}`}
							className={cn("group aspect-square h-auto min-w-0 p-3 text-left")}
						>
							<div className="flex h-full flex-col items-center justify-between gap-3">
								<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] px-2 py-1.5">
									<CursorClickEffectPreview
										effect={effect.id}
										color={effectColor}
									/>
								</div>
							</div>
						</ChoiceItem>
					);
				})}
			</ChoiceGroup>
		</div>
	);
}

interface SettingsPanelProps {
	onShowOnboarding?: () => void;
	advanced?: boolean;
	panelMode?: "editor" | "background";
	activeEffectSection?: EditorEffectSection;
	selected: string;
	onWallpaperChange: (path: string) => void;
	selectedZoomDepth?: ZoomDepth | null;
	onZoomDepthChange?: (depth: ZoomDepth) => void;
	selectedZoomId?: string | null;
	selectedZoomMode?: ZoomMode | null;
	onZoomModeChange?: (mode: ZoomMode) => void;
	selectedZoomInstant?: boolean;
	onZoomInstantChange?: (instant: boolean) => void;
	selectedZoomLoupe?: boolean;
	onZoomLoupeChange?: (loupe: boolean) => void;
	onZoomDelete?: (id: string) => void;
	selectedClipId?: string | null;
	selectedClipSpeed?: number | null;
	selectedClipMuted?: boolean | null;
	hasClipAudioOverrides?: boolean;
	onResetClipAudio?: () => void;
	onClipSpeedChange?: (speed: number) => void;
	onClipMutedChange?: (muted: boolean) => void;
	selectedClipVolume?: number | null;
	onClipVolumeChange?: (volume: number) => void;
	selectedClipHideCursor?: boolean;
	onClipHideCursorChange?: (hideCursor: boolean) => void;
	onClipSeparateAudio?: () => void;
	onClipDelete?: (id: string) => void;
	selectedAudioId?: string | null;
	selectedAudioVolume?: number | null;
	selectedAudioNormalize?: boolean | null;
	onAudioVolumeChange?: (volume: number) => void;
	onAudioNormalizeChange?: (normalize: boolean) => void;
	onAudioDelete?: (id: string) => void;
	shadowIntensity?: number;
	onShadowChange?: (intensity: number) => void;
	frameStyle?: FrameStyle;
	onFrameStyleChange?: (style: FrameStyle) => void;
	backgroundBlur?: number;
	onBackgroundBlurChange?: (amount: number) => void;
	connectZooms?: boolean;
	onConnectZoomsChange?: (enabled: boolean) => void;
	autoApplyFreshRecordingAutoZooms?: boolean;
	onAutoApplyFreshRecordingAutoZoomsChange?: (enabled: boolean) => void;
	zoomInDurationMs?: number;
	onZoomInDurationMsChange?: (duration: number) => void;
	zoomInOverlapMs?: number;
	onZoomInOverlapMsChange?: (duration: number) => void;
	zoomOutDurationMs?: number;
	onZoomOutDurationMsChange?: (duration: number) => void;
	connectedZoomGapMs?: number;
	onConnectedZoomGapMsChange?: (duration: number) => void;
	connectedZoomDurationMs?: number;
	onConnectedZoomDurationMsChange?: (duration: number) => void;
	zoomInEasing?: ZoomTransitionEasing;
	onZoomInEasingChange?: (easing: ZoomTransitionEasing) => void;
	zoomOutEasing?: ZoomTransitionEasing;
	onZoomOutEasingChange?: (easing: ZoomTransitionEasing) => void;
	connectedZoomEasing?: ZoomTransitionEasing;
	onConnectedZoomEasingChange?: (easing: ZoomTransitionEasing) => void;
	showCursor?: boolean;
	onShowCursorChange?: (enabled: boolean) => void;
	loopCursor?: boolean;
	onLoopCursorChange?: (enabled: boolean) => void;
	cursorStyle?: CursorStyle;
	onCursorStyleChange?: (style: CursorStyle) => void;
	cursorSize?: number;
	onCursorSizeChange?: (size: number) => void;
	cursorSmoothing?: number;
	onCursorSmoothingChange?: (smoothing: number) => void;
	cursorSpringStiffnessMultiplier?: number;
	onCursorSpringStiffnessMultiplierChange?: (multiplier: number) => void;
	cursorSpringDampingMultiplier?: number;
	onCursorSpringDampingMultiplierChange?: (multiplier: number) => void;
	cursorSpringMassMultiplier?: number;
	onCursorSpringMassMultiplierChange?: (multiplier: number) => void;
	cameraSpringStiffnessMultiplier?: number;
	onCameraSpringStiffnessMultiplierChange?: (multiplier: number) => void;
	cameraSpringDampingMultiplier?: number;
	onCameraSpringDampingMultiplierChange?: (multiplier: number) => void;
	cameraSpringMassMultiplier?: number;
	onCameraSpringMassMultiplierChange?: (multiplier: number) => void;
	zoomClassicMode?: boolean;
	onZoomClassicModeChange?: (enabled: boolean) => void;
	autoFrame?: boolean;
	onAutoFrameChange?: (enabled: boolean) => void;
	autoFrameFollowSpeed?: number;
	onAutoFrameFollowSpeedChange?: (speed: number) => void;
	cursorClickEffect?: CursorClickEffectStyle;
	onCursorClickEffectChange?: (effect: CursorClickEffectStyle) => void;
	cursorClickEffectColor?: string;
	onCursorClickEffectColorChange?: (color: string) => void;
	cursorClickEffectScale?: number;
	onCursorClickEffectScaleChange?: (scale: number) => void;
	cursorClickEffectOpacity?: number;
	onCursorClickEffectOpacityChange?: (opacity: number) => void;
	cursorClickEffectDurationMs?: number;
	onCursorClickEffectDurationMsChange?: (duration: number) => void;
	cursorClickBounce?: number;
	onCursorClickBounceChange?: (amount: number) => void;
	cursorClickBounceDuration?: number;
	onCursorClickBounceDurationChange?: (duration: number) => void;
	cursorSway?: number;
	cursorExtras?: CursorExtrasSettings;
	onCursorExtrasChange?: (patch: Partial<CursorExtrasSettings>) => void;
	colorGrading?: ColorGradingSettings;
	audioExtras?: AudioExtrasSettings;
	onAudioExtrasChange?: (next: AudioExtrasSettings) => void;
	micEnhanceStatus?: "off" | "processing" | "ready" | "error" | "no-mic";
	onColorGradingChange?: (next: ColorGradingSettings) => void;
	hasRecordedShortcuts?: boolean;
	onCursorSwayChange?: (amount: number) => void;
	borderRadius?: number;
	onBorderRadiusChange?: (radius: number) => void;
	webcam?: WebcamOverlaySettings;
	webcamPreviewSrc?: string | null;
	webcamPreviewCurrentTime?: number;
	webcamPreviewPlaying?: boolean;
	onWebcamChange?: (webcam: WebcamOverlaySettings) => void;
	onUploadWebcam?: () => void;
	onClearWebcam?: () => void;
	padding?: Padding;
	onPaddingChange?: (padding: Padding) => void;
	cropRegion?: CropRegion;
	onCropChange?: (region: CropRegion) => void;
	aspectRatio: AspectRatio;
	onAspectRatioChange?: (ratio: AspectRatio) => void;
	selectedAnnotationId?: string | null;
	annotationRegions?: AnnotationRegion[];
	onAnnotationContentChange?: (id: string, content: string) => void;
	onAnnotationTypeChange?: (id: string, type: AnnotationType) => void;
	onAnnotationStyleChange?: (id: string, style: Partial<AnnotationRegion["style"]>) => void;
	onAnnotationFigureDataChange?: (id: string, figureData: FigureData) => void;
	onAnnotationBlurIntensityChange?: (id: string, intensity: number) => void;
	onAnnotationBlurColorChange?: (id: string, color: string) => void;
	onAnnotationPatch?: (id: string, patch: Partial<AnnotationRegion>) => void;
	onAnnotationDelete?: (id: string) => void;
	autoCaptions?: CaptionCue[];
	clipRegions?: ClipRegion[];
	onCutSourceRanges?: (ranges: SourceRange[]) => boolean;
	autoCaptionSettings?: AutoCaptionSettings;
	whisperExecutablePath?: string | null;
	whisperModelPath?: string | null;
	whisperModelDownloadStatus?: "idle" | "downloading" | "downloaded" | "error";
	whisperModelDownloadProgress?: number;
	isGeneratingCaptions?: boolean;
	onAutoCaptionSettingsChange?: (settings: AutoCaptionSettings) => void;
	onPickWhisperExecutable?: () => void;
	onPickWhisperModel?: () => void;
	onGenerateAutoCaptions?: () => void;
	onClearAutoCaptions?: () => void;
	onDownloadWhisperSmallModel?: () => void;
	onDeleteWhisperSmallModel?: () => void;
	captionCurrentTimeMs?: number;
	selectedCaptionId?: string | null;
	onBeginCaptionEdit?: (id: string) => void;
	onCaptionTextEdit?: (id: string, text: string) => void;
	onCaptionRetime?: (id: string, span: CaptionRetimeSpan) => void;
	onCaptionSplit?: (id: string, atMs: number) => void;
	onCaptionMerge?: (idA: string, idB: string) => void;
	onCaptionDelete?: (id: string) => void;
	nativeCaptureUnavailableSession?: boolean;
	onOpenNativeCaptureUnavailableModal?: () => void;
}

const ZOOM_DEPTH_OPTIONS: Array<{ depth: ZoomDepth; label: string }> = [
	{ depth: 1, label: "1.25×" },
	{ depth: 2, label: "1.5×" },
	{ depth: 3, label: "1.8×" },
	{ depth: 4, label: "2.2×" },
	{ depth: 5, label: "3.5×" },
	{ depth: 6, label: "5×" },
];

const WEBCAM_POSITION_PRESETS: Array<{
	preset: Exclude<WebcamPositionPreset, "custom">;
	label: string;
}> = [
	{ preset: "top-left", label: "↖" },
	{ preset: "top-center", label: "↑" },
	{ preset: "top-right", label: "↗" },
	{ preset: "center-left", label: "←" },
	{ preset: "center", label: "•" },
	{ preset: "center-right", label: "→" },
	{ preset: "bottom-left", label: "↙" },
	{ preset: "bottom-center", label: "↓" },
	{ preset: "bottom-right", label: "↘" },
];

type CursorStyleOption = { value: CursorStyle; label: string };

type WallpaperTile = {
	key: string;
	label: string;
	value: string;
	previewUrl: string;
};

const BUILTIN_CURSOR_STYLE_OPTIONS: CursorStyleOption[] = [
	{ value: "macos", label: "macOS" },
	{ value: "tahoe", label: "Tahoe" },
	{ value: "tahoe-inverted", label: "Tahoe Inverted" },
	{ value: "windows11", label: "Windows 11" },
	{ value: "dot", label: "Dot" },
	{ value: "figma", label: "Minimal" },
];

const CAPTION_LANGUAGE_OPTIONS = [
	{ value: "auto", label: "Auto Detect" },
	{ value: "en", label: "English" },
	{ value: "es", label: "Spanish" },
	{ value: "fr", label: "French" },
	{ value: "de", label: "German" },
	{ value: "it", label: "Italian" },
	{ value: "pt", label: "Portuguese" },
	{ value: "zh", label: "Chinese (Simplified)" },
	{ value: "ja", label: "Japanese" },
	{ value: "ko", label: "Korean" },
] as const;

const APP_LANGUAGE_LABELS: Record<AppLocale, string> = {
	en: "English",
	es: "Español",
	fr: "Français",
	de: "Deutsch",
	it: "Italiano",
	nl: "Nederlands",
	ko: "한국어",
	"pt-BR": "Português",
	"zh-CN": "簡體中文",
	"zh-TW": "繁體中文",
};

function loadPreviewImage(url: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Failed to load preview asset: ${url}`));
		image.src = url;
	});
}

function trimCanvasToAlpha(canvas: HTMLCanvasElement, hotspot?: { x: number; y: number }) {
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return {
			dataUrl: canvas.toDataURL("image/png"),
			width: canvas.width,
			height: canvas.height,
			hotspot,
		};
	}

	const { width, height } = canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const { data } = imageData;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const alpha = data[(y * width + x) * 4 + 3];
			if (alpha === 0) {
				continue;
			}

			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}

	if (maxX < minX || maxY < minY) {
		return {
			dataUrl: canvas.toDataURL("image/png"),
			width,
			height,
			hotspot,
		};
	}

	const croppedWidth = maxX - minX + 1;
	const croppedHeight = maxY - minY + 1;
	const croppedCanvas = document.createElement("canvas");
	croppedCanvas.width = croppedWidth;
	croppedCanvas.height = croppedHeight;
	const croppedCtx = croppedCanvas.getContext("2d")!;
	croppedCtx.drawImage(
		canvas,
		minX,
		minY,
		croppedWidth,
		croppedHeight,
		0,
		0,
		croppedWidth,
		croppedHeight,
	);

	return {
		dataUrl: croppedCanvas.toDataURL("image/png"),
		width: croppedWidth,
		height: croppedHeight,
		hotspot: hotspot
			? {
					x: hotspot.x - minX,
					y: hotspot.y - minY,
				}
			: undefined,
	};
}

async function createTrimmedSvgPreview(
	url: string,
	sampleSize: number,
	trim?: { x: number; y: number; width: number; height: number },
) {
	const image = await loadPreviewImage(url);
	const sourceCanvas = document.createElement("canvas");
	sourceCanvas.width = sampleSize;
	sourceCanvas.height = sampleSize;
	const sourceCtx = sourceCanvas.getContext("2d")!;
	sourceCtx.drawImage(image, 0, 0, sampleSize, sampleSize);

	if (trim) {
		const croppedCanvas = document.createElement("canvas");
		croppedCanvas.width = trim.width;
		croppedCanvas.height = trim.height;
		const croppedCtx = croppedCanvas.getContext("2d")!;
		croppedCtx.drawImage(
			sourceCanvas,
			trim.x,
			trim.y,
			trim.width,
			trim.height,
			0,
			0,
			trim.width,
			trim.height,
		);
		return croppedCanvas.toDataURL("image/png");
	}

	return trimCanvasToAlpha(sourceCanvas).dataUrl;
}

async function createInvertedPreview(url: string) {
	const image = await loadPreviewImage(url);
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(image, 0, 0);
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const { data } = imageData;
	for (let index = 0; index < data.length; index += 4) {
		if (data[index + 3] === 0) {
			continue;
		}
		data[index] = 255 - data[index];
		data[index + 1] = 255 - data[index + 1];
		data[index + 2] = 255 - data[index + 2];
	}
	ctx.putImageData(imageData, 0, 0);
	return canvas.toDataURL("image/png");
}

function CursorStylePreview({
	style,
	previewUrls,
	frameSize = BUILTIN_CURSOR_PREVIEW_FRAME_SIZE,
	previewSize,
}: {
	style: CursorStyle;
	previewUrls: Partial<Record<string, string>>;
	frameSize?: number;
	previewSize?: number;
}) {
	const previewSrc =
		style === "macos"
			? (previewUrls.macos ?? tahoeCursorUrl)
			: style === "tahoe"
				? (previewUrls.tahoe ?? tahoeCursorUrl)
				: style === "windows11"
					? (previewUrls.windows11 ?? tahoeCursorUrl)
					: style === "figma"
						? (previewUrls.figma ?? minimalCursorUrl)
						: style === "tahoe-inverted"
							? (previewUrls["tahoe-inverted"] ?? tahoeCursorUrl)
							: previewUrls[style];

	if (
		style === "macos" ||
		style === "tahoe" ||
		style === "tahoe-inverted" ||
		style === "windows11"
	) {
		const resolvedPreviewSize =
			(previewSize ?? BUILTIN_CURSOR_PREVIEW_SIZE) *
			(style === "windows11" ? 1 : getCursorStyleSizeMultiplier(style));
		return (
			<div
				className="flex items-center justify-center"
				style={{
					width: `${frameSize}px`,
					height: `${frameSize}px`,
				}}
			>
				<img
					src={previewSrc ?? tahoeCursorUrl}
					alt=""
					className="max-w-none object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.18)]"
					draggable={false}
					style={{
						width: `${resolvedPreviewSize}px`,
						height: `${resolvedPreviewSize}px`,
					}}
				/>
			</div>
		);
	}

	if (style === "figma") {
		const resolvedPreviewSize = previewSize ?? 28;
		return (
			<div
				className="flex items-center justify-center"
				style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
			>
				<img
					src={previewSrc}
					alt=""
					className="object-contain"
					draggable={false}
					style={{
						width: `${resolvedPreviewSize}px`,
						height: `${resolvedPreviewSize}px`,
					}}
				/>
			</div>
		);
	}

	if (style === "dot") {
		const resolvedPreviewSize = previewSize ?? 14;
		return (
			<div
				className="flex items-center justify-center"
				style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
			>
				<span
					className="rounded-full border-[2.5px] border-neutral-800 bg-white shadow-[0_8px_12px_rgba(15,23,42,0.16)]"
					style={{
						width: `${resolvedPreviewSize}px`,
						height: `${resolvedPreviewSize}px`,
					}}
				/>
			</div>
		);
	}

	const resolvedPreviewSize = previewSize ?? 28;
	return (
		<div
			className="flex items-center justify-center"
			style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
		>
			<img
				src={previewSrc ?? tahoeCursorUrl}
				alt=""
				className="object-contain"
				draggable={false}
				style={{ width: `${resolvedPreviewSize}px`, height: `${resolvedPreviewSize}px` }}
			/>
		</div>
	);
}

export function SettingsPanel({
	onShowOnboarding,
	advanced = false,
	panelMode = "editor",
	activeEffectSection: activeEffectSectionProp,
	selected,
	onWallpaperChange,
	selectedZoomDepth,
	onZoomDepthChange,
	selectedZoomId,
	selectedZoomMode,
	onZoomModeChange,
	selectedZoomInstant = false,
	onZoomInstantChange,
	selectedZoomLoupe = false,
	onZoomLoupeChange,
	onZoomDelete,
	selectedClipId,
	selectedClipSpeed,
	selectedClipMuted,
	hasClipAudioOverrides = false,
	onResetClipAudio,
	onClipSpeedChange,
	onClipMutedChange,
	selectedClipHideCursor = false,
	onClipHideCursorChange,
	onClipSeparateAudio,
	onClipDelete,
	selectedClipVolume,
	onClipVolumeChange,
	selectedAudioId,
	selectedAudioVolume,
	selectedAudioNormalize,
	onAudioVolumeChange,
	onAudioNormalizeChange,
	onAudioDelete,
	shadowIntensity = 0.67,
	onShadowChange,
	frameStyle = DEFAULT_FRAME_STYLE,
	onFrameStyleChange,
	backgroundBlur = 0,
	onBackgroundBlurChange,
	connectZooms = true,
	onConnectZoomsChange,
	autoApplyFreshRecordingAutoZooms = true,
	onAutoApplyFreshRecordingAutoZoomsChange,
	zoomInDurationMs = DEFAULT_ZOOM_IN_DURATION_MS,
	onZoomInDurationMsChange,
	zoomOutDurationMs = DEFAULT_ZOOM_OUT_DURATION_MS,
	onZoomOutDurationMsChange,
	showCursor = false,
	onShowCursorChange,
	loopCursor = false,
	onLoopCursorChange,
	cursorStyle = DEFAULT_CURSOR_STYLE,
	onCursorStyleChange,
	cursorSize = 5,
	onCursorSizeChange,
	cursorSmoothing = 2,
	onCursorSmoothingChange,
	cursorSpringStiffnessMultiplier = 1,
	onCursorSpringStiffnessMultiplierChange,
	cursorSpringDampingMultiplier = 1,
	onCursorSpringDampingMultiplierChange,
	cursorSpringMassMultiplier = 1,
	onCursorSpringMassMultiplierChange,
	cameraSpringStiffnessMultiplier = 1,
	onCameraSpringStiffnessMultiplierChange,
	cameraSpringDampingMultiplier = 1.13,
	onCameraSpringDampingMultiplierChange,
	cameraSpringMassMultiplier = 1.12,
	onCameraSpringMassMultiplierChange,
	zoomClassicMode = false,
	onZoomClassicModeChange,
	autoFrame = false,
	onAutoFrameChange,
	autoFrameFollowSpeed = 0.5,
	onAutoFrameFollowSpeedChange,
	cursorClickEffect = DEFAULT_CURSOR_CLICK_EFFECT,
	onCursorClickEffectChange,
	cursorClickEffectColor = DEFAULT_CURSOR_CLICK_EFFECT_COLOR,
	onCursorClickEffectColorChange,
	cursorClickEffectScale = DEFAULT_CURSOR_CLICK_EFFECT_SCALE,
	onCursorClickEffectScaleChange,
	cursorClickEffectOpacity = DEFAULT_CURSOR_CLICK_EFFECT_OPACITY,
	onCursorClickEffectOpacityChange,
	cursorClickEffectDurationMs = DEFAULT_CURSOR_CLICK_EFFECT_DURATION_MS,
	onCursorClickEffectDurationMsChange,
	cursorClickBounce = 1,
	onCursorClickBounceChange,
	cursorClickBounceDuration = DEFAULT_CURSOR_CLICK_BOUNCE_DURATION,
	onCursorClickBounceDurationChange,
	cursorSway = DEFAULT_CURSOR_SWAY,
	cursorExtras = DEFAULT_CURSOR_EXTRAS,
	onCursorExtrasChange,
	colorGrading = DEFAULT_COLOR_GRADING,
	audioExtras = DEFAULT_AUDIO_EXTRAS,
	onAudioExtrasChange,
	micEnhanceStatus = "off",
	onColorGradingChange,
	hasRecordedShortcuts = false,
	onCursorSwayChange,
	borderRadius = getDefaultBorderRadiusPercent(),
	onBorderRadiusChange,
	webcam,
	webcamPreviewSrc = null,
	webcamPreviewCurrentTime = 0,
	webcamPreviewPlaying = false,
	onWebcamChange,
	onUploadWebcam,
	onClearWebcam,
	padding = DEFAULT_PADDING,
	onPaddingChange,
	cropRegion,
	onCropChange,
	aspectRatio,
	onAspectRatioChange,
	selectedAnnotationId,
	annotationRegions = [],
	onAnnotationContentChange,
	onAnnotationTypeChange,
	onAnnotationStyleChange,
	onAnnotationFigureDataChange,
	onAnnotationBlurIntensityChange,
	onAnnotationBlurColorChange,
	onAnnotationPatch,
	onAnnotationDelete,
	autoCaptions = [],
	clipRegions = [],
	onCutSourceRanges,
	autoCaptionSettings = DEFAULT_AUTO_CAPTION_SETTINGS,
	whisperModelPath,
	whisperModelDownloadStatus = "idle",
	whisperModelDownloadProgress = 0,
	isGeneratingCaptions = false,
	onAutoCaptionSettingsChange,
	onPickWhisperModel,
	onGenerateAutoCaptions,
	onClearAutoCaptions,
	onDownloadWhisperSmallModel,
	onDeleteWhisperSmallModel,
	captionCurrentTimeMs = 0,
	selectedCaptionId = null,
	onBeginCaptionEdit,
	onCaptionTextEdit,
	onCaptionRetime,
	onCaptionSplit,
	onCaptionMerge,
	onCaptionDelete,
	nativeCaptureUnavailableSession = false,
	onOpenNativeCaptureUnavailableModal,
}: SettingsPanelProps) {
	const tSettings = useScopedT("settings");
	const { locale, setLocale, t } = useI18n();
	const { preference: themePreference, setPreference: setThemePreference } = useTheme();
	const settingsSide = useSettingsSide();
	const isBackgroundPanel = panelMode === "background";
	const initialEditorPreferences = useMemo(() => loadEditorPreferences(), []);
	const clipSpeedRange = useMemo(getPreviewPlaybackRateRange, []);
	const [builtInWallpapers, setBuiltInWallpapers] =
		useState<BuiltInWallpaper[]>(BUILT_IN_WALLPAPERS);
	const [wallpaperPreviewPaths, setWallpaperPreviewPaths] = useState<string[]>([]);
	const [customImages, setCustomImages] = useState<string[]>(
		initialEditorPreferences.customWallpapers,
	);
	const [experimentalUpdatesEnabled, setExperimentalUpdatesEnabled] = useState(false);
	const [savingExperimentalUpdates, setSavingExperimentalUpdates] = useState(false);
	const { openConfig: openShortcutsConfig } = useShortcuts();
	const [internalActiveEffectSection] = useState<EditorEffectSection>("scene");
	const activeEffectSection = activeEffectSectionProp ?? internalActiveEffectSection;
	const removeBackgroundStateRef = useRef<{
		aspectRatio: AspectRatio;
		padding: Padding;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const builtInWallpaperPaths = useMemo(
		() => builtInWallpapers.map((wallpaper) => wallpaper.publicPath),
		[builtInWallpapers],
	);
	const captionCueCount = autoCaptions.length;
	const updateAutoCaptionSettings = (partial: Partial<AutoCaptionSettings>) => {
		onAutoCaptionSettingsChange?.({
			...autoCaptionSettings,
			...partial,
		});
	};

	useEffect(() => {
		let cancelled = false;
		void window.electronAPI
			.getExperimentalUpdatesEnabled()
			.then((enabled) => {
				if (!cancelled) setExperimentalUpdatesEnabled(enabled);
			})
			.catch((error) => {
				console.error("Failed to load experimental updates preference:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const updateExperimentalUpdatesPreference = async (enabled: boolean) => {
		const previousValue = experimentalUpdatesEnabled;
		setExperimentalUpdatesEnabled(enabled);
		setSavingExperimentalUpdates(true);
		try {
			const result = await window.electronAPI.setExperimentalUpdatesEnabled(enabled);
			setExperimentalUpdatesEnabled(result.enabled);
			if (!result.success) {
				toast.error(
					result.error ||
						tSettings("updates.saveFailed", "Failed to change the update channel."),
				);
			}
		} catch (error) {
			setExperimentalUpdatesEnabled(previousValue);
			toast.error(
				`${tSettings("updates.saveFailed", "Failed to change the update channel.")} ${String(error)}`,
			);
		} finally {
			setSavingExperimentalUpdates(false);
		}
	};

	useEffect(() => {
		if (
			!isBackgroundPanel &&
			activeEffectSection !== "scene" &&
			activeEffectSection !== "frame" &&
			activeEffectSection !== "crop" &&
			activeEffectSection !== "extensions" &&
			!activeEffectSection.startsWith("ext:")
		) {
			return;
		}

		let mounted = true;
		(async () => {
			try {
				const availableWallpapers = await getAvailableWallpapers();
				const resolved = await Promise.all(
					availableWallpapers.map(async (wallpaper) => {
						const assetUrl = await getAssetPath(wallpaper.relativePath);
						// Use tiny thumbnails for the grid; full-res loads on selection
						if (isVideoWallpaperSource(wallpaper.publicPath)) {
							return getRenderableVideoUrl(assetUrl);
						}
						return getWallpaperThumbnailUrl(assetUrl);
					}),
				);
				if (mounted) {
					setBuiltInWallpapers(availableWallpapers);
					setWallpaperPreviewPaths(resolved);
				}
			} catch {
				if (mounted) {
					setBuiltInWallpapers(BUILT_IN_WALLPAPERS);
					setWallpaperPreviewPaths(
						BUILT_IN_WALLPAPERS.map((wallpaper) => wallpaper.publicPath),
					);
				}
			}
		})();
		return () => {
			mounted = false;
		};
	}, [activeEffectSection, isBackgroundPanel]);

	const colorPalette = [
		"#FF0000",
		"#FFD700",
		"#00FF00",
		"#FFFFFF",
		"#0000FF",
		"#FF6B00",
		"#9B59B6",
		"#E91E63",
		"#00BCD4",
		"#FF5722",
		"#8BC34A",
		"#FFC107",
		"#2563EB",
		"#000000",
		"#607D8B",
		"#795548",
	];

	const [selectedColor, setSelectedColor] = useState(
		isHexWallpaper(selected) ? selected : "#ADADAD",
	);
	const [gradient, setGradient] = useState<string>(
		GRADIENTS.includes(selected) ? selected : GRADIENTS[0],
	);
	const removeBackgroundEnabled = aspectRatio === "native" && isZeroPadding(padding);

	const [backgroundTab, setBackgroundTab] = useState<BackgroundTab>(() =>
		getBackgroundTabForWallpaper(selected, customImages),
	);

	const defaultWebcam = initialEditorPreferences.webcam;
	const [builtInCursorPreviewUrls, setBuiltInCursorPreviewUrls] = useState<
		Partial<Record<string, string>>
	>({});

	const cursorPreviewUrls = builtInCursorPreviewUrls;
	// Personal build: keep fine motion tuning available outside dev mode.
	const showDevMotionControls = true;
	const cursorStyleOptions = BUILTIN_CURSOR_STYLE_OPTIONS;

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const macosPreview = cursorSetAssets.macos.arrow.url;
				const tahoePreview = cursorSetAssets.tahoe.arrow.url;
				const [windows11Preview, minimalPreview] = await Promise.all([
					createTrimmedSvgPreview(cursorSetAssets.windows11.arrow.url, 512),
					createTrimmedSvgPreview(minimalCursorUrl, 512),
				]);
				const invertedPreview = await createInvertedPreview(tahoePreview);

				if (!cancelled) {
					setBuiltInCursorPreviewUrls({
						macos: macosPreview,
						tahoe: tahoePreview,
						windows11: windows11Preview,
						figma: minimalPreview,
						"tahoe-inverted": invertedPreview,
					});
				}
			} catch {
				if (!cancelled) {
					setBuiltInCursorPreviewUrls({
						macos: tahoeCursorUrl,
						tahoe: tahoeCursorUrl,
						windows11: tahoeCursorUrl,
						figma: minimalCursorUrl,
						"tahoe-inverted": tahoeCursorUrl,
					});
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setBackgroundTab(getBackgroundTabForWallpaper(selected, customImages));

		if (isHexWallpaper(selected)) {
			setSelectedColor(selected);
		}

		if (GRADIENTS.includes(selected)) {
			setGradient(selected);
		}
	}, [selected]);

	useEffect(() => {
		if (selected.startsWith("data:image")) {
			setCustomImages((prev) => (prev.includes(selected) ? prev : [selected, ...prev]));
			return;
		}

		const isKnownWallpaper =
			builtInWallpaperPaths.includes(selected) || wallpaperPreviewPaths.includes(selected);

		if (!isKnownWallpaper && isVideoWallpaperSource(selected)) {
			setCustomImages((prev) => (prev.includes(selected) ? prev : [selected, ...prev]));
		}
	}, [builtInWallpaperPaths, selected, wallpaperPreviewPaths]);

	const imageWallpaperTiles = useMemo<WallpaperTile[]>(() => {
		const imageWallpapers = builtInWallpapers.filter(
			(wallpaper) => !isVideoWallpaperSource(wallpaper.publicPath),
		);
		const builtInTiles = (
			wallpaperPreviewPaths.length > 0 ? wallpaperPreviewPaths : builtInWallpaperPaths
		)
			.filter((path) => !isVideoWallpaperSource(path))
			.map((previewPath, index) => {
				const wallpaper = imageWallpapers[index];
				return {
					key: wallpaper ? `builtin/${wallpaper.id}` : previewPath,
					label: wallpaper?.label ?? `Wallpaper ${index + 1}`,
					value: wallpaper?.publicPath ?? previewPath,
					previewUrl: wallpaperPreviewPaths.length ? previewPath : "",
				};
			});

		return builtInTiles;
	}, [builtInWallpaperPaths, builtInWallpapers, wallpaperPreviewPaths]);

	const videoWallpaperTiles = useMemo<WallpaperTile[]>(() => {
		const builtInTiles = builtInWallpapers
			.filter((wallpaper) => isVideoWallpaperSource(wallpaper.publicPath))
			.map((wallpaper) => ({
				key: `builtin/${wallpaper.id}`,
				label: wallpaper.label,
				value: wallpaper.publicPath,
				previewUrl: wallpaper.publicPath,
			}));

		return builtInTiles;
	}, [builtInWallpapers]);

	useEffect(() => {
		saveEditorPreferences({ customWallpapers: customImages });
	}, [customImages]);

	const handleRemoveBackgroundToggle = (checked: boolean) => {
		if (checked) {
			removeBackgroundStateRef.current = {
				aspectRatio,
				padding,
			};
			onAspectRatioChange?.("native");
			onPaddingChange?.({ top: 0, bottom: 0, left: 0, right: 0, linked: padding.linked });
			return;
		}

		const previousState = removeBackgroundStateRef.current;
		if (previousState) {
			onAspectRatioChange?.(previousState.aspectRatio);
			onPaddingChange?.(previousState.padding);
			removeBackgroundStateRef.current = null;
			return;
		}

		// Fallback if the project loaded in a "background removed" state already
		onAspectRatioChange?.(initialEditorPreferences.aspectRatio);
		onPaddingChange?.({ ...DEFAULT_PADDING });
	};

	const togglePaddingLink = () => {
		const isLinked = padding.linked !== false;
		const nextLinked = !isLinked;
		if (nextLinked) {
			// Compute average for relinking to avoid sudden shifts
			const avg = Math.round(
				(padding.top + padding.bottom + padding.left + padding.right) / 4,
			);
			onPaddingChange?.({
				top: avg,
				bottom: avg,
				left: avg,
				right: avg,
				linked: true,
			});
		} else {
			onPaddingChange?.({
				...padding,
				linked: false,
			});
		}
	};

	const handlePaddingSideChange = (side: keyof Padding, value: number) => {
		if (padding.linked !== false) {
			onPaddingChange?.({
				top: value,
				bottom: value,
				left: value,
				right: value,
				linked: true,
			});
		} else {
			onPaddingChange?.({
				...padding,
				[side]: value,
			});
		}
	};

	const webcamFileName = webcam?.sourcePath?.split(/[\\/]/).pop() ?? null;
	const visibleColorPalette = colorPalette.slice(0, 15);
	const webcamPositionPreset = webcam?.positionPreset ?? DEFAULT_WEBCAM_POSITION_PRESET;
	const webcamPositionX = webcam?.positionX ?? DEFAULT_WEBCAM_POSITION_X;
	const webcamPositionY = webcam?.positionY ?? DEFAULT_WEBCAM_POSITION_Y;
	const webcamWidth = webcam?.width ?? webcam?.size ?? DEFAULT_WEBCAM_SIZE;
	const webcamHeight = webcam?.height ?? webcam?.size ?? DEFAULT_WEBCAM_SIZE;
	const webcamCrop = normalizeWebcamCropRegion(webcam?.cropRegion);

	const getWallpaperTileState = (candidateValue: string, previewPath?: string) => {
		if (!selected) return false;
		if (selected === candidateValue || (previewPath && selected === previewPath)) return true;
		try {
			const clean = (s: string) => s.replace(/^file:\/\//, "").replace(/^\//, "");
			if (clean(selected).endsWith(clean(candidateValue))) return true;
			if (clean(candidateValue).endsWith(clean(selected))) return true;
			if (previewPath && clean(selected).endsWith(clean(previewPath))) return true;
			if (previewPath && clean(previewPath).endsWith(clean(selected))) return true;
		} catch {
			return false;
		}
		return false;
	};

	const pickRandomWallpaper = () => {
		const choices = imageWallpaperTiles.filter((tile) => !getWallpaperTileState(tile.value, tile.previewUrl));
		const pick = choices[Math.floor(Math.random() * choices.length)];
		if (pick) onWallpaperChange(pick.value);
	};

	const wallpaperTileClass = (isSelected: boolean) =>
		cn(
			"group relative aspect-[4/3] h-auto w-full min-w-0 overflow-hidden rounded-md p-1",
			isSelected && "opacity-70",
		);

	const crop = cropRegion ?? {
		x: 0,
		y: 0,
		width: 1,
		height: 1,
	};
	const cropTop = Math.round(crop.y * 100);
	const cropLeft = Math.round(crop.x * 100);
	const cropBottom = Math.round((1 - crop.y - crop.height) * 100);
	const cropRight = Math.round((1 - crop.x - crop.width) * 100);
	const isCropped = cropTop > 0 || cropLeft > 0 || cropBottom > 0 || cropRight > 0;

	const setCropInset = (side: "top" | "bottom" | "left" | "right", pct: number) => {
		if (!onCropChange) return;

		const v = pct / 100;
		let { x, y, width, height } = crop;

		if (side === "top") {
			const nextY = Math.min(v, 1 - y - height + v);
			y = nextY;
			height = Math.max(0.05, height - (nextY - crop.y));
		}

		if (side === "left") {
			const nextX = Math.min(v, 1 - x - width + v);
			x = nextX;
			width = Math.max(0.05, width - (nextX - crop.x));
		}

		if (side === "bottom") {
			height = Math.max(0.05, 1 - crop.y - v);
		}

		if (side === "right") {
			width = Math.max(0.05, 1 - crop.x - v);
		}

		onCropChange({ x, y, width, height });
	};

	const resetBackgroundSection = () => {
		onBackgroundBlurChange?.(initialEditorPreferences.backgroundBlur);

		const preferredWallpaper = initialEditorPreferences.wallpaper;
		const hasPreferredWallpaper =
			(preferredWallpaper && builtInWallpaperPaths.includes(preferredWallpaper)) ||
			(preferredWallpaper && customImages.includes(preferredWallpaper)) ||
			(preferredWallpaper && isHexWallpaper(preferredWallpaper)) ||
			(preferredWallpaper && GRADIENTS.includes(preferredWallpaper));

		onWallpaperChange(
			(hasPreferredWallpaper ? preferredWallpaper : "") ||
				builtInWallpaperPaths[0] ||
				BUILT_IN_WALLPAPERS[0]?.publicPath ||
				"",
		);
	};

	const resetZoomSection = () => {
		onCameraSpringStiffnessMultiplierChange?.(
			initialEditorPreferences.cameraSpringStiffnessMultiplier,
		);
		onCameraSpringDampingMultiplierChange?.(
			initialEditorPreferences.cameraSpringDampingMultiplier,
		);
		onCameraSpringMassMultiplierChange?.(initialEditorPreferences.cameraSpringMassMultiplier);
		onZoomInDurationMsChange?.(initialEditorPreferences.zoomInDurationMs);
		onZoomOutDurationMsChange?.(initialEditorPreferences.zoomOutDurationMs);
		onZoomClassicModeChange?.(false);
	};

	const resetCursorSection = () => {
		onShowCursorChange?.(initialEditorPreferences.showCursor);
		onLoopCursorChange?.(initialEditorPreferences.loopCursor);
		onCursorStyleChange?.(initialEditorPreferences.cursorStyle);
		onCursorSizeChange?.(initialEditorPreferences.cursorSize);
		onCursorSmoothingChange?.(initialEditorPreferences.cursorSmoothing);
		onCursorSpringStiffnessMultiplierChange?.(
			initialEditorPreferences.cursorSpringStiffnessMultiplier,
		);
		onCursorSpringDampingMultiplierChange?.(
			initialEditorPreferences.cursorSpringDampingMultiplier,
		);
		onCursorSpringMassMultiplierChange?.(initialEditorPreferences.cursorSpringMassMultiplier);
		onCursorClickEffectChange?.(initialEditorPreferences.cursorClickEffect);
		onCursorClickEffectColorChange?.(initialEditorPreferences.cursorClickEffectColor);
		onCursorClickEffectScaleChange?.(initialEditorPreferences.cursorClickEffectScale);
		onCursorClickEffectOpacityChange?.(initialEditorPreferences.cursorClickEffectOpacity);
		onCursorClickEffectDurationMsChange?.(initialEditorPreferences.cursorClickEffectDurationMs);
		onCursorClickBounceChange?.(initialEditorPreferences.cursorClickBounce);
		onCursorClickBounceDurationChange?.(initialEditorPreferences.cursorClickBounceDuration);
		onCursorSwayChange?.(initialEditorPreferences.cursorSway);
		onCursorExtrasChange?.(initialEditorPreferences.cursorExtras);
	};

	const activeMotionPresetId = useMemo(() => {
		return (
			getMatchingCursorMotionPresetId({
				zoomInDurationMs,
				zoomOutDurationMs,
				cursorSize,
				cursorSmoothing,
				cursorSpringStiffnessMultiplier,
				cursorSpringDampingMultiplier,
				cursorSpringMassMultiplier,
				cursorClickBounce,
				cursorClickBounceDuration,
			}) ?? "focused"
		);
	}, [
		cursorClickBounce,
		cursorClickBounceDuration,
		cursorSize,
		cursorSmoothing,
		cursorSpringDampingMultiplier,
		cursorSpringMassMultiplier,
		cursorSpringStiffnessMultiplier,
		zoomInDurationMs,
		zoomOutDurationMs,
	]);

	const applyMotionPreset = (presetId: CursorMotionPresetId) => {
		const preset = CURSOR_MOTION_PRESETS[presetId];
		onZoomInDurationMsChange?.(preset.zoomInDurationMs);
		onZoomOutDurationMsChange?.(preset.zoomOutDurationMs);
		onCursorSizeChange?.(preset.cursorSize);
		onCursorSmoothingChange?.(preset.cursorSmoothing);
		onCursorSpringStiffnessMultiplierChange?.(preset.cursorSpringStiffnessMultiplier);
		onCursorSpringDampingMultiplierChange?.(preset.cursorSpringDampingMultiplier);
		onCursorSpringMassMultiplierChange?.(preset.cursorSpringMassMultiplier);
		onCursorClickBounceChange?.(preset.cursorClickBounce);
		onCursorClickBounceDurationChange?.(preset.cursorClickBounceDuration);
	};

	const resetFrameSection = () => {
		onShadowChange?.(initialEditorPreferences.shadowIntensity);
		onFrameStyleChange?.(DEFAULT_FRAME_STYLE);
		onBorderRadiusChange?.(initialEditorPreferences.borderRadius);
		onAspectRatioChange?.(initialEditorPreferences.aspectRatio);
		onPaddingChange?.({ ...initialEditorPreferences.padding });
		removeBackgroundStateRef.current = null;
		onColorGradingChange?.({ ...colorGrading, screen: DEFAULT_COLOR_GRADING.screen });
	};

	const cameraAiStatus = useSyncExternalStore(subscribeCameraAiStatus, getCameraAiStatus);
	const resetWebcamSection = () => {
		onColorGradingChange?.({
			...colorGrading,
			camera: DEFAULT_COLOR_GRADING.camera,
			cameraSharpness: DEFAULT_COLOR_GRADING.cameraSharpness,
		});
		if (!onWebcamChange) return;
		onWebcamChange({ ...defaultWebcam, layoutRegions: webcam?.layoutRegions ?? [] });
	};

	const resetCropSection = () => {
		onCropChange?.(DEFAULT_CROP_REGION);
	};

	const updateWebcam = (patch: Partial<WebcamOverlaySettings>) => {
		if (!webcam || !onWebcamChange) return;
		onWebcamChange({ ...webcam, ...patch });
	};

	const applyWebcamPositionPreset = (preset: WebcamPositionPreset) => {
		if (!webcam) return;

		if (preset === "custom") {
			updateWebcam({ positionPreset: "custom" });
			return;
		}

		const position = getWebcamPositionForPreset(preset);
		updateWebcam({
			positionPreset: preset,
			positionX: position.x,
			positionY: position.y,
			corner: resolveWebcamCorner(preset, webcam.corner),
		});
	};

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (!files || files.length === 0) return;

		const file = files[0];

		// Validate file type - only allow JPG/JPEG
		const validTypes = ["image/jpeg", "image/jpg"];
		if (!validTypes.includes(file.type)) {
			toast.error(tSettings("background.uploadError"), {
				description: tSettings("background.uploadErrorDescription"),
			});
			event.target.value = "";
			return;
		}

		const reader = new FileReader();

		reader.onload = (e) => {
			const dataUrl = e.target?.result as string;
			if (dataUrl) {
				setCustomImages((prev) => [...prev, dataUrl]);
				onWallpaperChange(dataUrl);
				toast.success(tSettings("background.uploadSuccess"));
			}
		};

		reader.onerror = () => {
			toast.error(t("common.errors.failedToUploadImage"), {
				description: t("common.errors.fileReadError"),
			});
		};

		reader.readAsDataURL(file);
		// Reset input so the same file can be selected again
		event.target.value = "";
	};

	const handleVideoUpload = async () => {
		try {
			const result = await window.electronAPI.openVideoFilePicker();
			if (!result?.success || !result.path) return;
			const filePath = result.path;
			if (!isVideoWallpaperSource(filePath)) {
				toast.error(tSettings("background.unsupportedFormat", "Unsupported format"), {
					description: tSettings(
						"background.unsupportedFormatDesc",
						"Please select a video file (mp4, webm, mov, etc.)",
					),
				});
				return;
			}
			setCustomImages((prev) => [filePath, ...prev]);
			onWallpaperChange(filePath);
			toast.success(tSettings("background.videoAdded", "Video background added"));
		} catch {
			toast.error(
				tSettings("background.videoImportFailed", "Failed to import video background"),
			);
		}
	};

	const handleRemoveCustomImage = (imageUrl: string) => {
		setCustomImages((prev) => prev.filter((img) => img !== imageUrl));
		// If the removed image was selected, clear selection
		if (selected === imageUrl) {
			onWallpaperChange(builtInWallpaperPaths[0] ?? BUILT_IN_WALLPAPERS[0]?.publicPath ?? "");
		}
	};

	// Find selected annotation
	const selectedAnnotation = selectedAnnotationId
		? annotationRegions.find((a) => a.id === selectedAnnotationId)
		: null;

	const backgroundSettingsContent = (
		<div className="space-y-5">
			<section className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-3">
					<SectionLabel>{tSettings("background.title")}</SectionLabel>
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-muted"
						type="button"
						onClick={resetBackgroundSection}
					>
						{t("common.actions.reset", "Reset")}
					</Button>
				</div>
			</section>

			<div className="w-full">
				<ChoiceGroup
					type="single"
					value={backgroundTab}
					onValueChange={(value) => {
						if (value) {
							setBackgroundTab(value as typeof backgroundTab);
						}
					}}
					aria-label={tSettings("background.title", "Background type")}
					className="grid w-full grid-cols-4 gap-1"
				>
					{(
						[
							{ value: "wallpaper", label: tSettings("background.wallpaper", "Wallpaper") },
							{ value: "gradient", label: tSettings("background.gradient") },
							{ value: "color", label: tSettings("background.color") },
							{ value: "image", label: tSettings("background.image") },
						] as const
					).map((option) => (
						<ChoiceItem
							key={option.value}
							value={option.value}
							className="flex-1 min-w-0 whitespace-nowrap px-1"
						>
							{option.label}
						</ChoiceItem>
					))}
				</ChoiceGroup>

				<input
					type="file"
					ref={fileInputRef}
					onChange={handleImageUpload}
					accept=".jpg,.jpeg,image/jpeg"
					className="hidden"
				/>
				<div className="grid pt-4 overflow-hidden" data-testid="background-slider">
					<div
						key={backgroundTab}
						data-background-panel={backgroundTab}
						className="editor-section-enter min-w-0"
					>
						{backgroundTab === "wallpaper" ? (
							<div className="flex flex-col gap-3">
								<Button
									variant="secondary"
									type="button"
									data-testid="random-wallpaper"
									className="w-full justify-center gap-2 text-xs"
									onClick={pickRandomWallpaper}
								>
									<MagicWand className="size-4" />
									{tSettings("background.randomWallpaper", "Pick random wallpaper")}
								</Button>
								<WallpaperGrid
									addLabel=""
									onSelect={onWallpaperChange}
									onRemove={handleRemoveCustomImage}
									isSelected={getWallpaperTileState}
									items={imageWallpaperTiles}
								/>
							</div>
						) : backgroundTab === "image" ? (
							<div className="flex flex-col gap-4">
								<WallpaperGrid
									addLabel={tSettings("background.addWallpaper", "Add wallpaper")}
									onAdd={() => fileInputRef.current?.click()}
									onSelect={onWallpaperChange}
									onRemove={handleRemoveCustomImage}
									isSelected={getWallpaperTileState}
									items={customImages
										.filter((url) => !isVideoWallpaperSource(url))
										.map((url, index) => ({
											key: `custom-${index}`,
											value: url,
											previewUrl: url,
											label: `${tSettings("background.customWallpaper", "Custom wallpaper")} ${index + 1}`,
											removable: true,
										}))}
								/>
								<SectionLabel>{tSettings("background.video", "Video")}</SectionLabel>
								<WallpaperGrid
									addLabel={tSettings("background.addVideoWallpaper", "Add video wallpaper")}
									onAdd={handleVideoUpload}
									onSelect={onWallpaperChange}
									onRemove={handleRemoveCustomImage}
									isSelected={getWallpaperTileState}
									items={[
										...customImages
											.filter((url) => isVideoWallpaperSource(url))
											.map((url, index) => ({
												key: `custom-video-${index}`,
												value: url,
												previewUrl: url,
												label: url.split(/[\/]/).pop() ?? "Custom video wallpaper",
												removable: true,
											})),
										...videoWallpaperTiles,
									]}
								/>
							</div>
						) : backgroundTab === "color" ? (
							<div className="mt-0 space-y-4">
								<div className="flex flex-col gap-3">
									<ColorPalette
										color={selectedColor}
										colors={visibleColorPalette}
										onChange={({ hex }) => {
											setSelectedColor(hex);
											onWallpaperChange(hex);
										}}
									/>
									<ColorControl
										label={tSettings("background.customColor", "Custom color")}
										value={selectedColor}
										onChange={(color) => {
											setSelectedColor(color);
											onWallpaperChange(color);
										}}
									/>
								</div>
							</div>
						) : (
							<div className="mt-0 grid grid-cols-5 gap-2">
								{GRADIENTS.map((g, idx) => (
									<Button
										variant="ghost"
										key={g}
										className={wallpaperTileClass(gradient === g)}
										aria-label={`Gradient ${idx + 1}`}
										onClick={() => {
											setGradient(g);
											onWallpaperChange(g);
										}}
										role="button"
									>
										<div
											className="absolute inset-[1px] overflow-hidden rounded-[8px]"
											style={{ background: g }}
										/>
									</Button>
								))}
							</div>
						)}
					</div>
				</div>
				<div className="pt-4">
					<SliderControl
						label={tSettings("background.blur", "Background blur")}
						value={backgroundBlur}
						min={0}
						max={8}
						step={0.25}
						onChange={(v) => onBackgroundBlurChange?.(v)}
						formatValue={(v) => `${v.toFixed(1)}px`}
					/>
				</div>
			</div>
		</div>
	);

	// If an annotation is selected, show annotation settings instead
	if (
		!isBackgroundPanel &&
		selectedAnnotation &&
		onAnnotationContentChange &&
		onAnnotationTypeChange &&
		onAnnotationStyleChange &&
		onAnnotationDelete
	) {
		return (
			<AnnotationSettingsPanel
				annotation={selectedAnnotation}
				onContentChange={(content) =>
					onAnnotationContentChange(selectedAnnotation.id, content)
				}
				onTypeChange={(type) => onAnnotationTypeChange(selectedAnnotation.id, type)}
				onStyleChange={(style) => onAnnotationStyleChange(selectedAnnotation.id, style)}
				onFigureDataChange={
					onAnnotationFigureDataChange
						? (figureData) =>
								onAnnotationFigureDataChange(selectedAnnotation.id, figureData)
						: undefined
				}
				onBlurIntensityChange={
					onAnnotationBlurIntensityChange
						? (intensity) =>
								onAnnotationBlurIntensityChange(selectedAnnotation.id, intensity)
						: undefined
				}
				onBlurColorChange={
					onAnnotationBlurColorChange
						? (color) => onAnnotationBlurColorChange(selectedAnnotation.id, color)
						: undefined
				}
				onRegionChange={
					onAnnotationPatch
						? (patch) => onAnnotationPatch(selectedAnnotation.id, patch)
						: undefined
				}
				onDelete={() => onAnnotationDelete(selectedAnnotation.id)}
			/>
		);
	}

	if (isBackgroundPanel) {
		return (
			<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-none bg-transparent p-0 shadow-none">
				<div
					data-testid="settings-scroll"
					className="settings-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pb-8 pt-1"
					style={{ scrollbarGutter: "stable" }}
				>
					<div className="mb-4 flex items-center gap-2">
						<Palette className="w-4 h-4 text-accent" />
						<span className="text-sm font-medium text-foreground">
							{tSettings("background.title")}
						</span>
					</div>
					{backgroundSettingsContent}
				</div>
			</Card>
		);
	}

	const frameSectionContent = (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<SectionLabel>{tSettings("sections.frame", "Frame")}</SectionLabel>
				<Button
					variant="ghost"
					size="sm"
					className="text-xs text-muted"
					type="button"
					onClick={resetFrameSection}
				>
					{t("common.actions.reset", "Reset")}
				</Button>
			</div>
			<div className="flex flex-col gap-3">
				<SliderControl
					label={tSettings("effects.shadow")}
					value={shadowIntensity}
					min={0}
					max={1}
					step={0.01}
					onChange={(v) => onShadowChange?.(v)}
					formatValue={(v) => `${Math.round(v * 100)}%`}
				/>
				{shadowIntensity > 0 && (
					<div className="flex flex-col gap-3 border-l border-foreground/10 pl-3" data-testid="shadow-detail">
						<SliderControl
							label={tSettings("effects.shadowAngle", "Angle")}
							value={frameStyle.shadowAngle}
							min={0}
							max={360}
							step={1}
							onChange={(v) => onFrameStyleChange?.({ ...frameStyle, shadowAngle: v })}
							formatValue={(v) => `${Math.round(v)}°`}
						/>
						<SliderControl
							label={tSettings("effects.shadowDistance", "Distance")}
							value={frameStyle.shadowDistance}
							min={FRAME_STYLE_LIMITS.shadowDistance.min}
							max={FRAME_STYLE_LIMITS.shadowDistance.max}
							step={0.01}
							onChange={(v) => onFrameStyleChange?.({ ...frameStyle, shadowDistance: v })}
							formatValue={(v) => `${Math.round(v * 100)}%`}
						/>
						<SliderControl
							label={tSettings("effects.shadowSoftness", "Softness")}
							value={frameStyle.shadowSoftness}
							min={FRAME_STYLE_LIMITS.shadowSoftness.min}
							max={FRAME_STYLE_LIMITS.shadowSoftness.max}
							step={0.01}
							onChange={(v) => onFrameStyleChange?.({ ...frameStyle, shadowSoftness: v })}
							formatValue={(v) => `${Math.round(v * 100)}%`}
						/>
					</div>
				)}
				<SliderControl
					label={tSettings("effects.inset", "Inset")}
					value={frameStyle.inset}
					min={FRAME_STYLE_LIMITS.inset.min}
					max={FRAME_STYLE_LIMITS.inset.max}
					step={0.1}
					onChange={(v) => onFrameStyleChange?.({ ...frameStyle, inset: v })}
					formatValue={(v) => `${v.toFixed(1)}%`}
				/>
				<SliderControl
					label={tSettings("effects.radius", "Radius")}
					value={borderRadius}
					min={0}
					max={50}
					step={0.1}
					onChange={(v) => onBorderRadiusChange?.(v)}
					formatValue={(v) => `${v}%`}
				/>
				<div className="flex flex-col gap-3 pt-0.5">
					{advanced && (
						<div className="flex items-center justify-between gap-3">
							<Label>{tSettings("padding.linkSides", "Link padding sides")}</Label>
							<Switch
								aria-label={tSettings("padding.linkSides", "Link padding sides")}
								checked={padding.linked !== false}
								onCheckedChange={togglePaddingLink}
							/>
						</div>
					)}

					{padding.linked !== false ? (
						<SliderControl
							label={tSettings("effects.padding")}
							value={padding.top}
							min={0}
							max={100}
							step={1}
							onChange={(v) => handlePaddingSideChange("top", v)}
							formatValue={(v) => `${v}%`}
						/>
					) : (
						<div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
							<SliderControl
								label={tSettings("effects.paddingTop", "Top")}
								value={padding.top}
								min={0}
								max={ADVANCED_VERTICAL_PADDING_MAX}
								step={1}
								onChange={(v) => handlePaddingSideChange("top", v)}
								formatValue={(v) => `${v}%`}
							/>
							<SliderControl
								label={tSettings("effects.paddingBottom", "Bottom")}
								value={padding.bottom}
								min={0}
								max={ADVANCED_VERTICAL_PADDING_MAX}
								step={1}
								onChange={(v) => handlePaddingSideChange("bottom", v)}
								formatValue={(v) => `${v}%`}
							/>
							<SliderControl
								label={tSettings("effects.paddingLeft", "Left")}
								value={padding.left}
								min={0}
								max={100}
								step={1}
								onChange={(v) => handlePaddingSideChange("left", v)}
								formatValue={(v) => `${v}%`}
							/>
							<SliderControl
								label={tSettings("effects.paddingRight", "Right")}
								value={padding.right}
								min={0}
								max={100}
								step={1}
								onChange={(v) => handlePaddingSideChange("right", v)}
								formatValue={(v) => `${v}%`}
							/>
						</div>
					)}
				</div>
				<div className="flex items-center justify-between py-2">
					<span className="text-xs text-muted-foreground">
						{tSettings("effects.removeBackground")}
					</span>
					<Switch
						aria-label={tSettings("effects.removeBackground")}
						checked={removeBackgroundEnabled}
						onCheckedChange={handleRemoveBackgroundToggle}
					/>
				</div>
				<ColorLookControl
					source="screen"
					value={colorGrading.screen}
					onChange={(screen) => onColorGradingChange?.({ ...colorGrading, screen })}
				/>
			</div>
		</section>
	);

	const cropSectionContent = (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<SectionLabel>{tSettings("sections.crop", "Crop")}</SectionLabel>
				{isCropped ? (
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-muted"
						type="button"
						onClick={resetCropSection}
					>
						{t("common.actions.reset", "Reset")}
					</Button>
				) : null}
			</div>
			<div className="flex flex-col gap-3">
				<SliderControl
					label={tSettings("crop.top", "Top")}
					value={cropTop}
					min={0}
					max={50}
					step={1}
					onChange={(v) => setCropInset("top", v)}
					formatValue={(v) => `${Math.round(v)}%`}
				/>
				<SliderControl
					label={tSettings("crop.bottom", "Bottom")}
					value={cropBottom}
					min={0}
					max={50}
					step={1}
					onChange={(v) => setCropInset("bottom", v)}
					formatValue={(v) => `${Math.round(v)}%`}
				/>
				<SliderControl
					label={tSettings("crop.left", "Left")}
					value={cropLeft}
					min={0}
					max={50}
					step={1}
					onChange={(v) => setCropInset("left", v)}
					formatValue={(v) => `${Math.round(v)}%`}
				/>
				<SliderControl
					label={tSettings("crop.right", "Right")}
					value={cropRight}
					min={0}
					max={50}
					step={1}
					onChange={(v) => setCropInset("right", v)}
					formatValue={(v) => `${Math.round(v)}%`}
				/>
			</div>
		</section>
	);

	const captionsSectionContent = (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<SectionLabel>{tSettings("captions.generation", "Generation")}</SectionLabel>
					<Button
						className="text-xs text-muted"
						size="sm"
						variant="ghost"
						type="button"
						onClick={() => onAutoCaptionSettingsChange?.(DEFAULT_AUTO_CAPTION_SETTINGS)}
					>
						{t("common.actions.reset", "Reset")}
					</Button>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{tSettings("captions.enabled", "Show")}</span>
					<Switch
						aria-label={tSettings("captions.enabled", "Show")}
						checked={autoCaptionSettings.enabled}
						onCheckedChange={(enabled) => updateAutoCaptionSettings({ enabled })}
					/>
				</div>
			</div>

			<div className="py-2 space-y-3">
				{advanced && (
					<div>
						<Button
							type="button"
							variant="outline"
							onClick={onPickWhisperModel}
							className="h-9 w-full px-4 text-sm"
						>
							{tSettings("captions.useCustomModel", "Use custom")}
						</Button>
					</div>
				)}
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.language", "Language")}
					</div>
					<Select
						value={autoCaptionSettings.language || "auto"}
						onValueChange={(value) => updateAutoCaptionSettings({ language: value })}
					>
						<SelectTrigger className="h-9 w-[180px] text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CAPTION_LANGUAGE_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{tSettings(`captions.languageOptions.${option.value}`, option.label)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.model", "Model")}
					</div>
					<Select
						value={autoCaptionSettings.model ?? "small"}
						onValueChange={(value) =>
							updateAutoCaptionSettings({
								model: value as AutoCaptionSettings["model"],
							})
						}
					>
						<SelectTrigger className="h-9 w-[180px] text-sm" data-testid="caption-model-select">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="base">
								{tSettings("captions.modelBase", "Fast (Base)")}
							</SelectItem>
							<SelectItem value="small">
								{tSettings("captions.modelSmall", "Normal (Small)")}
							</SelectItem>
							<SelectItem value="medium">
								{tSettings("captions.modelMedium", "Accurate (Medium)")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.prompt", "Frequent words")}
					</div>
					<Input
						aria-label={tSettings("captions.prompt", "Frequent words")}
						data-testid="caption-prompt-input"
						value={autoCaptionSettings.prompt ?? ""}
						maxLength={500}
						placeholder={tSettings(
							"captions.promptPlaceholder",
							"Names and terms, e.g. Recordly, Kubernetes",
						)}
						onChange={(event) => updateAutoCaptionSettings({ prompt: event.target.value })}
						className="h-9 w-full text-sm"
					/>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.displayMode", "Display")}
					</div>
					<Select
						value={autoCaptionSettings.displayMode}
						onValueChange={(value) =>
							updateAutoCaptionSettings({ displayMode: value as "line" | "word" })
						}
					>
						<SelectTrigger className="h-9 w-[180px] text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="line">
								{tSettings("captions.displayLine", "Line")}
							</SelectItem>
							<SelectItem value="word">
								{tSettings("captions.displayWord", "Word by word")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.animation", "Animation")}
					</div>
					<Select
						value={autoCaptionSettings.animationStyle}
						onValueChange={(value) =>
							updateAutoCaptionSettings({
								animationStyle: value as AutoCaptionAnimation,
							})
						}
					>
						<SelectTrigger className="h-9 w-[180px] text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CAPTION_ANIMATION_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{tSettings(
										`captions.animation${option.value === "none" ? "Off" : option.value[0].toUpperCase() + option.value.slice(1)}`,
										option.label,
									)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="grid w-full grid-cols-1 gap-2">
						{whisperModelDownloadStatus === "downloading" ? (
							<Button type="button" disabled className="h-9 w-full px-4 text-sm">
								{tSettings("captions.downloading", "Downloading...")}{" "}
								{Math.round(whisperModelDownloadProgress)}%
							</Button>
						) : whisperModelPath ? (
							<Button
								type="button"
								variant="outline"
								onClick={onDeleteWhisperSmallModel}
								className="h-9 w-full px-4 text-sm"
							>
								{tSettings("captions.deleteModel", "Delete Model")}
							</Button>
						) : (
							<Button
								type="button"
								onClick={onDownloadWhisperSmallModel}
								className="h-9 w-full px-4 text-sm"
							>
								{tSettings("captions.downloadModel", "Download Model")} (
								{{ base: "148 MB", small: "488 MB", medium: "1.5 GB" }[
									autoCaptionSettings.model ?? "small"
								]}
								)
							</Button>
						)}
						<Button
							type="button"
							variant="outline"
							onClick={onClearAutoCaptions}
							disabled={captionCueCount === 0}
							className="h-9 w-full px-4 text-sm"
						>
							{tSettings("captions.clearFull", "Clear Captions")}
						</Button>
					</div>
				</div>
				<div className="flex flex-col gap-4">
					<Button
						type="button"
						onClick={onGenerateAutoCaptions}
						disabled={isGeneratingCaptions || !whisperModelPath}
						className="h-9 w-full px-4 text-sm"
					>
						{isGeneratingCaptions
							? tSettings("captions.generating", "Generating...")
							: captionCueCount > 0
								? tSettings("captions.regenerateFull", "Regenerate Captions")
								: tSettings("captions.generateFull", "Generate Captions")}
					</Button>
					{isGeneratingCaptions ? (
						<div className="space-y-1">
							<div className="text-xs text-muted-foreground">
								{tSettings(
									"captions.generatingStatus",
									"Generating captions. This can take a moment.",
								)}
							</div>
							<ProgressBar aria-label={tSettings("captions.downloadingModel", "Downloading caption model")} isIndeterminate>
								<ProgressBar.Track>
									<ProgressBar.Fill />
								</ProgressBar.Track>
							</ProgressBar>
						</div>
					) : null}
				</div>
				{whisperModelDownloadStatus === "downloading" ? (
					<div className="h-2 overflow-hidden rounded-full bg-foreground/5">
						<div
							className="h-full rounded-full bg-accent transition-all"
							style={{ width: `${whisperModelDownloadProgress}%` }}
						/>
					</div>
				) : null}
			</div>

			{onCutSourceRanges && (
				<TranscriptPanel
					cues={autoCaptions}
					clipRegions={clipRegions}
					onCutSourceRanges={onCutSourceRanges}
				/>
			)}

			<div className="flex flex-col gap-3">
				{advanced && (
					<div className="flex items-center justify-between gap-3 py-2">
						<div className="text-xs text-muted-foreground">
							{tSettings("captions.timelineQuickAdd", "Hover to add on timeline")}
						</div>
						<Switch
							checked={autoCaptionSettings.timelineQuickAdd}
							onCheckedChange={(timelineQuickAdd) =>
								updateAutoCaptionSettings({ timelineQuickAdd })
							}
							aria-label={tSettings(
								"captions.timelineQuickAdd",
								"Hover to add on timeline",
							)}
						/>
					</div>
				)}

				<div className="mb-1 text-sm font-medium text-foreground">
					{tSettings("captions.fontSettings", "Font Settings")}
				</div>
				<SliderControl
					label={tSettings("captions.fontSize", "Font size")}
					value={autoCaptionSettings.fontSize}
					min={16}
					max={72}
					step={1}
					onChange={(value) => updateAutoCaptionSettings({ fontSize: value })}
					formatValue={(value) => `${Math.round(value)}px`}
				/>
				<div className="flex items-center justify-between py-2">
					<span className="text-sm font-medium text-foreground">
						{tSettings("captions.textColor", "Text color")}
					</span>
					<ColorControl
						compact
						label={tSettings("captions.textColor", "Text color")}
						value={autoCaptionSettings.textColor}
						onChange={(color) => updateAutoCaptionSettings({ textColor: color })}
					/>
				</div>
				{advanced && (
					<SliderControl
						label={tSettings("captions.rowCount", "Rows")}
						value={autoCaptionSettings.maxRows}
						min={1}
						max={4}
						step={1}
						onChange={(value) =>
							updateAutoCaptionSettings({ maxRows: Math.round(value) })
						}
						formatValue={(value) => `${Math.round(value)}`}
					/>
				)}
				{advanced && (
					<SliderControl
						label={tSettings("captions.bottomOffset", "Bottom offset")}
						value={autoCaptionSettings.bottomOffset}
						min={0}
						max={30}
						step={1}
						onChange={(value) => updateAutoCaptionSettings({ bottomOffset: value })}
						formatValue={(value) => `${Math.round(value)}%`}
					/>
				)}
				{advanced && (
					<SliderControl
						label={tSettings("captions.maxWidth", "Max width")}
						value={autoCaptionSettings.maxWidth}
						min={40}
						max={95}
						step={1}
						onChange={(value) => updateAutoCaptionSettings({ maxWidth: value })}
						formatValue={(value) => `${Math.round(value)}%`}
					/>
				)}
				{advanced && (
					<SliderControl
						label={tSettings("captions.boxRadius", "Box radius")}
						value={autoCaptionSettings.boxRadius}
						min={0}
						max={40}
						step={0.5}
						onChange={(value) => updateAutoCaptionSettings({ boxRadius: value })}
						formatValue={(value) =>
							`${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}px`
						}
					/>
				)}
				{advanced && (
					<SliderControl
						label={tSettings("captions.backgroundOpacity", "Background opacity")}
						value={autoCaptionSettings.backgroundOpacity}
						min={0}
						max={1}
						step={0.01}
						onChange={(value) =>
							updateAutoCaptionSettings({ backgroundOpacity: value })
						}
						formatValue={(value) => `${Math.round(value * 100)}%`}
					/>
				)}
			</div>
		</section>
	);

	const effectSectionContent = (() => {
		const settingsSectionContent = (
			<SettingsSections
				categories={advanced ? ["general", "motion", "advanced"] : ["general", "motion"]}
			>
				<SettingsCategory category="general">
					{onShowOnboarding && (
						<SettingsRow title={tSettings("general.onboarding", "Onboarding")}>
							<Button variant="secondary" size="sm" onClick={onShowOnboarding}>
								{tSettings("general.showOnboarding", "Show onboarding")}
							</Button>
						</SettingsRow>
					)}

					<SettingsRow title={t("editor.theme.appearance", "Brightness")} stacked>
						<ChoiceGroup
							type="single"
							aria-label={t("editor.theme.appearance", "Brightness")}
							value={themePreference}
							onValueChange={(value) => {
								if (value === "light" || value === "dark" || value === "system")
									setThemePreference(value);
							}}
							fullWidth
							size="sm"
						>
							<ChoiceItem value="light" className="flex-1">
								{t("editor.theme.light", "Light")}
							</ChoiceItem>
							<ChoiceItem value="dark" className="flex-1">
								{t("editor.theme.dark", "Dark")}
							</ChoiceItem>
							<ChoiceItem value="system" className="flex-1">
								{t("editor.theme.system", "System")}
							</ChoiceItem>
						</ChoiceGroup>
					</SettingsRow>

					<SettingsRow title={t("editor.settingsSide.label", "Settings panel position")} stacked>
						<ChoiceGroup
							type="single"
							aria-label={t("editor.settingsSide.label", "Settings panel position")}
							value={settingsSide}
							onValueChange={(value) => {
								if (value === "left" || value === "right") setSettingsSide(value);
							}}
							fullWidth
							size="sm"
						>
							<ChoiceItem value="left" className="flex-1">
								{t("editor.settingsSide.left", "Left")}
							</ChoiceItem>
							<ChoiceItem value="right" className="flex-1">
								{t("editor.settingsSide.right", "Right")}
							</ChoiceItem>
						</ChoiceGroup>
					</SettingsRow>

					<SettingsRow title={t("common.app.language", "Language")} stacked>
						<Select
							value={locale}
							onValueChange={(value) => setLocale(value as AppLocale)}
						>
							<SelectTrigger className="h-9 w-full text-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SUPPORTED_LOCALES.map((candidateLocale) => (
									<SelectItem key={candidateLocale} value={candidateLocale}>
										{APP_LANGUAGE_LABELS[candidateLocale]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SettingsRow>
				</SettingsCategory>
				<SettingsCategory category="advanced">
					{advanced && (
						<section className="flex flex-col gap-4">
							<SectionLabel>{tSettings("updates.title", "Updates")}</SectionLabel>
							<SettingsRow
								title={tSettings("updates.experimental", "Experimental updates")}
								description={tSettings(
									"updates.experimentalDescription",
									"This is the front line of user testing - highly experimental so expect bugs",
								)}
							>
								<Switch
									checked={experimentalUpdatesEnabled}
									disabled={savingExperimentalUpdates}
									onCheckedChange={(enabled) =>
										void updateExperimentalUpdatesPreference(enabled)
									}
									aria-label={tSettings(
										"updates.experimental",
										"Experimental updates",
									)}
								/>
							</SettingsRow>
						</section>
					)}
				</SettingsCategory>
				<SettingsCategory category="motion">
					<section className="flex flex-col gap-4">
						<MotionPresetCards
							title={tSettings("effects.motionPresetsTitle", "Motion Presets")}
							activePresetId={activeMotionPresetId}
							onApply={applyMotionPreset}
							tSettings={tSettings}
						/>
					</section>
				</SettingsCategory>
				<SettingsCategory category="general">
					<SettingsRow title={t("editor.keyboardShortcuts.title")}>
						<Button variant="secondary" size="sm" onClick={openShortcutsConfig}>
							{t("editor.keyboardShortcuts.customize")}
						</Button>
					</SettingsRow>
				</SettingsCategory>
				<SettingsCategory category="advanced">
					{advanced && showDevMotionControls ? (
						<section className="flex flex-col gap-4 rounded-xl border border-separator bg-surface-secondary p-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<SectionLabel>
										{tSettings("effects.devSection", "Dev")}
									</SectionLabel>
									<div className="mt-0.5 text-xs text-muted-foreground">
										{tSettings(
											"effects.devSectionHint",
											"Temporary testing controls for native capture and motion tuning.",
										)}
									</div>
								</div>
								<span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
									{tSettings("effects.devBadge", "DEV")}
								</span>
							</div>

							<div className="rounded-lg border border-foreground/10 bg-background/60 px-3 py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="text-sm font-medium text-foreground">
											{tSettings(
												"effects.nativeCaptureWarningTester",
												"Native capture warning",
											)}
										</div>
										<div className="mt-0.5 text-xs text-muted-foreground">
											{nativeCaptureUnavailableSession
												? tSettings(
														"effects.nativeCaptureWarningTesterUnavailable",
														"This project is currently marked as native capture unavailable.",
													)
												: tSettings(
														"effects.nativeCaptureWarningTesterAvailable",
														"This project is not marked as unsupported, but you can still open the modal for UI testing.",
													)}
										</div>
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onOpenNativeCaptureUnavailableModal?.()}
										className="h-8 shrink-0"
									>
										{tSettings(
											"effects.openNativeCaptureWarning",
											"Open warning",
										)}
									</Button>
								</div>
							</div>

							<div className="space-y-1.5 rounded-lg border border-foreground/10 bg-background/60 px-3 py-3">
								<div>
									<div className="text-sm font-medium text-foreground">
										{tSettings(
											"effects.cameraDebugTuning",
											"Camera Debug Tuning",
										)}
									</div>
									<div className="mt-0.5 text-xs text-muted-foreground">
										{tSettings(
											"effects.cameraDebugTuningHint",
											"Development-only spring tuning controls for camera motion.",
										)}
									</div>
								</div>
								<SliderControl
									label={tSettings(
										"effects.cameraSpringStiffnessMultiplier",
										"Camera stiffness",
									)}
									value={cameraSpringStiffnessMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) =>
										onCameraSpringStiffnessMultiplierChange?.(value)
									}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings(
										"effects.cameraSpringDampingMultiplier",
										"Camera damping",
									)}
									value={cameraSpringDampingMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) =>
										onCameraSpringDampingMultiplierChange?.(value)
									}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings(
										"effects.cameraSpringMassMultiplier",
										"Camera mass",
									)}
									value={cameraSpringMassMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) =>
										onCameraSpringMassMultiplierChange?.(value)
									}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
							</div>

							<div className="space-y-1.5 rounded-lg border border-foreground/10 bg-background/60 px-3 py-3">
								<div>
									<div className="text-sm font-medium text-foreground">
										{tSettings(
											"effects.cursorDebugTuning",
											"Cursor Debug Tuning",
										)}
									</div>
									<div className="mt-0.5 text-xs text-muted-foreground">
										{tSettings(
											"effects.cursorDebugTuningHint",
											"Development-only spring tuning controls.",
										)}
									</div>
								</div>
								<SliderControl
									label={tSettings(
										"effects.cursorSpringStiffnessMultiplier",
										"Spring stiffness",
									)}
									value={cursorSpringStiffnessMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) =>
										onCursorSpringStiffnessMultiplierChange?.(value)
									}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings(
										"effects.cursorSpringDampingMultiplier",
										"Spring damping",
									)}
									value={cursorSpringDampingMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) =>
										onCursorSpringDampingMultiplierChange?.(value)
									}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings(
										"effects.cursorSpringMassMultiplier",
										"Spring mass",
									)}
									value={cursorSpringMassMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) =>
										onCursorSpringMassMultiplierChange?.(value)
									}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
							</div>
						</section>
					) : null}
				</SettingsCategory>
			</SettingsSections>
		);

		const sceneSectionContent = (
			<div className="space-y-5">
				{backgroundSettingsContent}
				{frameSectionContent}
				{advanced && cropSectionContent}
			</div>
		);

		const zoomItemSectionContent = (
			<section className="flex flex-col gap-4">
				{selectedZoomId && (
					<>
						<SectionLabel>{tSettings("zoom.mode", "Mode")}</SectionLabel>
						<div className="mb-1">
							<ChoiceGroup
								aria-label={tSettings("zoom.modeLabel", "Zoom mode")}
								value={selectedZoomMode ?? "auto"}
								onValueChange={(value) => onZoomModeChange?.(value as ZoomMode)}
								className="grid grid-cols-2 gap-2"
							>
								<ChoiceItem value="auto">
									{tSettings("zoom.modeAuto", "Auto")}
								</ChoiceItem>
								<ChoiceItem value="manual">
									{tSettings("zoom.modeManual", "Manual")}
								</ChoiceItem>
							</ChoiceGroup>
							<p className="mt-1.5 text-xs text-muted-foreground/70">
								{selectedZoomMode === "manual"
									? tSettings(
											"zoom.modeManualDescription",
											"Set a fixed focus point for this zoom",
										)
									: tSettings(
											"zoom.modeAutoDescription",
											"Camera recenters when the cursor nears the edge of the zoomed view",
										)}
							</p>
						</div>
						<SectionLabel>{tSettings("zoom.amount", "Amount")}</SectionLabel>
						<ChoiceGroup
							aria-label={tSettings("zoom.levelLabel", "Zoom level")}
							value={String(selectedZoomDepth)}
							onValueChange={(value) =>
								onZoomDepthChange?.(Number(value) as ZoomDepth)
							}
							className="grid grid-cols-3 gap-2"
						>
							{ZOOM_DEPTH_OPTIONS.map((option) => (
								<ChoiceItem key={option.depth} value={String(option.depth)}>
									{option.label}
								</ChoiceItem>
							))}
						</ChoiceGroup>
						<div className="flex items-center justify-between py-1">
							<span className="text-xs text-muted-foreground">
								{tSettings("zoom.instantAnimation", "Instant Animation")}
							</span>
							<Switch
								aria-label={tSettings("zoom.instantAnimation", "Instant Animation")}
								checked={selectedZoomInstant}
								onCheckedChange={(v) => onZoomInstantChange?.(v)}
							/>
						</div>
						<div className="flex items-center justify-between py-1">
							<span className="text-xs text-muted-foreground">
								{tSettings("zoom.glassLoupe", "Glass Loupe")}
							</span>
							<Switch
								aria-label={tSettings("zoom.glassLoupe", "Glass Loupe")}
								checked={selectedZoomLoupe}
								onCheckedChange={(v) => onZoomLoupeChange?.(v)}
							/>
						</div>
					</>
				)}
			<div className="flex flex-col gap-4">
				<SettingsRow
					title={tSettings(
						"effects.autoApplyFreshRecordingZooms",
						"Auto-apply fresh recording zooms",
					)}
					description={tSettings(
						"effects.autoApplyFreshRecordingZoomsDescription",
						"Suggest cursor-follow zooms automatically when you open a new recording.",
					)}
				>
					<Switch
						aria-label={tSettings(
							"effects.autoApplyFreshRecordingZooms",
							"Auto-apply fresh recording zooms",
						)}
						checked={autoApplyFreshRecordingAutoZooms}
						onCheckedChange={onAutoApplyFreshRecordingAutoZoomsChange}
					/>
				</SettingsRow>
				<SettingsRow
					title={tSettings("effects.connectZooms", "Connect neighboring zooms")}
					description={tSettings(
						"effects.connectZoomsDescription",
						"Smooth consecutive zoom regions into a continuous camera move.",
					)}
				>
					<Switch
						aria-label={tSettings(
							"effects.connectZooms",
							"Connect neighboring zooms",
						)}
						checked={connectZooms}
						onCheckedChange={onConnectZoomsChange}
					/>
				</SettingsRow>
			</div>
				<div>
					<div className="flex items-center justify-between py-1">
						<span className="text-xs text-muted-foreground">
							{tSettings("zoom.autoFrame", "Always keep zoomed in")}
						</span>
						<Switch
							aria-label={tSettings("zoom.autoFrame", "Always keep zoomed in")}
							checked={autoFrame}
							onCheckedChange={(v) => onAutoFrameChange?.(v)}
						/>
					</div>
					<p className="mt-1 text-xs text-muted-foreground/70">
						{tSettings(
							"zoom.autoFrameDescription",
							"Fill the selected aspect ratio and follow the cursor",
						)}
					</p>
					{autoFrame && (
						<div className="mt-3">
							<SliderControl
								label={tSettings("zoom.autoFrameFollowSpeed", "Follow speed")}
								value={autoFrameFollowSpeed}
								min={0}
								max={1}
								step={0.05}
								onChange={(v) => onAutoFrameFollowSpeedChange?.(v)}
								formatValue={(v) =>
									v < 0.34
										? tSettings("zoom.followSpeedSlow", "Slow")
										: v > 0.66
											? tSettings("zoom.followSpeedFast", "Fast")
											: tSettings("zoom.followSpeedNormal", "Normal")
								}
							/>
						</div>
					)}
				</div>
				{advanced && (
					<>
						<div className="flex items-center justify-between gap-3">
							<SectionLabel>
								{tSettings("zoom.globalSettings", "Animation")}
							</SectionLabel>
							<Button
								variant="ghost"
								size="sm"
								className="text-xs text-muted"
								type="button"
								onClick={resetZoomSection}
							>
								{t("common.actions.reset", "Reset")}
							</Button>
						</div>
						<div className="flex items-center justify-between py-2">
							<span className="text-xs text-muted-foreground">
								{tSettings("effects.classicZoom", "Classic Animation")}
							</span>
							<Switch
								aria-label={tSettings("effects.classicZoom", "Classic Animation")}
								checked={zoomClassicMode}
								onCheckedChange={(v) => onZoomClassicModeChange?.(v)}
							/>
						</div>
						{!zoomClassicMode && (
							<div className="text-xs text-muted-foreground">
								{tSettings(
									"effects.motionPresetsZoomHint",
									"Zoom motion presets are available in Settings.",
								)}
							</div>
						)}
					</>
				)}
			</section>
		);

		const setMusic = (patch: Partial<AudioExtrasSettings["music"]>) =>
			onAudioExtrasChange?.({ ...audioExtras, music: { ...audioExtras.music, ...patch } });
		const customMusicPath =
			audioExtras.music.path && !audioExtras.music.path.startsWith("/music/")
				? audioExtras.music.path
				: null;
		const micModeHint: Record<MicAudioMode, string> = {
			standard: tSettings("audio.micModeStandardHint", "Original microphone sound."),
			"noise-reduction": tSettings(
				"audio.micModeNoiseReductionHint",
				"Removes keyboard, fan and room noise.",
			),
			podcast: tSettings(
				"audio.micModePodcastHint",
				"Noise reduction plus EQ, compression and loudness leveling, for talks and tutorials.",
			),
		};
		const projectAudioContent = (
			<section className="flex flex-col gap-3">
				<SectionLabel>{tSettings("audio.microphone", "Microphone")}</SectionLabel>
				<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span>{tSettings("audio.micMode", "Microphone audio mode")}</span>
					<Select
						value={audioExtras.micMode}
						onValueChange={(value) =>
							onAudioExtrasChange?.({ ...audioExtras, micMode: value as MicAudioMode })
						}
					>
						<SelectTrigger
							className="h-8 w-[160px] text-xs"
							aria-label={tSettings("audio.micMode", "Microphone audio mode")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="standard">{tSettings("audio.micModeStandard", "Standard")}</SelectItem>
							<SelectItem value="noise-reduction">
								{tSettings("audio.micModeNoiseReduction", "Noise reduction")}
							</SelectItem>
							<SelectItem value="podcast">{tSettings("audio.micModePodcast", "Podcast")}</SelectItem>
						</SelectContent>
					</Select>
				</label>
				<p className="text-xs text-muted-foreground" role="status">
					{micEnhanceStatus === "processing" && audioExtras.micMode !== "standard"
						? tSettings("audio.micModeProcessing", "Processing microphone audio…")
						: micEnhanceStatus === "no-mic"
							? tSettings("audio.micModeNoMic", "This recording has no separate microphone track.")
							: micEnhanceStatus === "error"
								? tSettings("audio.micModeError", "Couldn't process the microphone audio. Using the original.")
								: micModeHint[audioExtras.micMode]}
				</p>
				<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span>{tSettings("audio.muteMic", "Mute microphone")}</span>
					<Switch
						aria-label={tSettings("audio.muteMic", "Mute microphone")}
						checked={audioExtras.micMuted}
						onCheckedChange={(micMuted) => onAudioExtrasChange?.({ ...audioExtras, micMuted })}
					/>
				</label>

				<div className="mt-3">
					<SectionLabel>{tSettings("audio.backgroundMusic", "Background audio")}</SectionLabel>
				</div>
				<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span>{tSettings("audio.track", "Track")}</span>
					<Select
						value={audioExtras.music.path ?? "none"}
						onValueChange={(value) => {
							if (value === "upload") {
								void window.electronAPI.openAudioFilePicker().then((result) => {
									if (result.success && result.path) setMusic({ path: result.path });
								});
								return;
							}
							setMusic({ path: value === "none" ? null : value });
						}}
					>
						<SelectTrigger
							className="h-8 w-[160px] text-xs"
							aria-label={tSettings("audio.backgroundMusic", "Background audio")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">{tSettings("audio.musicNone", "None")}</SelectItem>
							{BUILTIN_MUSIC_TRACKS.map((track) => (
								<SelectItem key={track.id} value={track.path}>
									{track.label}
								</SelectItem>
							))}
							{customMusicPath && (
								<SelectItem value={customMusicPath}>
									{customMusicPath.split(/[\\/]/).pop()}
								</SelectItem>
							)}
							<SelectItem value="upload">{tSettings("audio.musicUpload", "Upload MP3/MP4…")}</SelectItem>
						</SelectContent>
					</Select>
				</label>
				{audioExtras.music.path && (
					<>
						<SliderControl
							label={tSettings("audio.musicVolume", "Music volume")}
							value={audioExtras.music.volume}
							min={0}
							max={1}
							step={0.01}
							onChange={(volume) => setMusic({ volume })}
							formatValue={(v) => `${Math.round(v * 100)}%`}
						/>
						<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
							<span>{tSettings("audio.musicDucking", "Lower music while speaking")}</span>
							<Switch
								aria-label={tSettings("audio.musicDucking", "Lower music while speaking")}
								checked={audioExtras.music.ducking}
								onCheckedChange={(ducking) => setMusic({ ducking })}
							/>
						</label>
					</>
				)}
			</section>
		);

		const audioRegionContent = (
			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<SectionLabel>{tSettings("audio.volumeTitle", "Audio")}</SectionLabel>
					<Button
						className="text-xs text-muted"
						size="sm"
						variant="ghost"
						type="button"
						onClick={() => {
							onAudioVolumeChange?.(1);
							onAudioNormalizeChange?.(false);
						}}
					>
						{t("common.actions.reset", "Reset")}
					</Button>
				</div>
				<SliderControl
					label={tSettings("audio.volume", "Volume")}
					value={selectedAudioVolume ?? 1}
					min={0}
					max={1}
					step={0.01}
					onChange={(v) => onAudioVolumeChange?.(v)}
					formatValue={(v) => `${Math.round(v * 100)}%`}
				/>
				<div className="flex items-center justify-between py-2">
					<span className="text-xs text-muted-foreground">
						{tSettings("audio.normalize", "Normalize")}
					</span>
					<Switch
						aria-label={tSettings("audio.normalize", "Normalize")}
						checked={Boolean(selectedAudioNormalize)}
						onCheckedChange={(v) => onAudioNormalizeChange?.(v)}
					/>
				</div>
			</section>
		);
		const audioSectionContent = selectedAudioId ? audioRegionContent : projectAudioContent;

		const clipSectionContent = (
			<section className="flex flex-col gap-3">
				<SliderControl
					label={tSettings("speed.label", "Speed")}
					value={Math.min(
						clipSpeedRange.max,
						Math.max(clipSpeedRange.min, selectedClipSpeed ?? 1),
					)}
					min={clipSpeedRange.min}
					max={clipSpeedRange.max}
					step={0.25}
					onChange={(value) => onClipSpeedChange?.(value)}
					formatValue={(value) => `${value}×`}
				/>
				{selectedClipSpeed != null &&
					(selectedClipSpeed < clipSpeedRange.min ||
						selectedClipSpeed > clipSpeedRange.max) && (
						<p className="text-xs text-muted-foreground" role="status">
							{selectedClipSpeed}× —{" "}
							{tSettings(
								"speed.unsupported",
								"Not supported for preview on this device",
							)}
						</p>
					)}
				<SliderControl
					label={tSettings("clip.volume", "Volume")}
					value={Math.round((selectedClipVolume ?? 1) * 100)}
					min={0}
					max={100}
					step={5}
					onChange={(value) => onClipVolumeChange?.(value / 100)}
					formatValue={(value) => `${value}%`}
				/>
				<label className="flex items-center justify-between py-2">
					<span className="text-xs text-muted-foreground">
						{tSettings("clip.mute", "Mute clip")}
					</span>
					<Switch
						checked={selectedClipMuted ?? false}
						onCheckedChange={(muted) => onClipMutedChange?.(muted)}
						aria-label={tSettings("clip.mute", "Mute clip")}
					/>
				</label>
				<label className="flex items-center justify-between py-2">
					<span className="text-xs text-muted-foreground">
						{tSettings("clip.hideCursor", "Hide cursor")}
					</span>
					<Switch
						checked={selectedClipHideCursor}
						onCheckedChange={(hideCursor) => onClipHideCursorChange?.(hideCursor)}
						aria-label={tSettings("clip.hideCursor", "Hide cursor")}
					/>
				</label>
				{onClipSeparateAudio && (
					<Button
						type="button"
						variant="outline"
						className="w-full whitespace-nowrap"
						onClick={onClipSeparateAudio}
					>
						{tSettings("clip.separateClipFromAudio", "Separate clip from audio")}
					</Button>
				)}
				{hasClipAudioOverrides && onResetClipAudio && (
					<Button type="button" variant="ghost" onClick={onResetClipAudio}>
						{tSettings("clip.resetAudioSettings", "Reset audio settings")}
					</Button>
				)}
			</section>
		);

		const captionSectionContent = (
			<section className="flex flex-col gap-4">
				{selectedCaptionId !== null ? (
					<CaptionListPanel
						cues={autoCaptions}
						selectedCaptionId={selectedCaptionId}
						currentTimeMs={captionCurrentTimeMs}
						onBeginCaptionEdit={(id) => onBeginCaptionEdit?.(id)}
						onCaptionTextEdit={(id, text) => onCaptionTextEdit?.(id, text)}
						onCaptionRetime={(id, span) => onCaptionRetime?.(id, span)}
						onCaptionSplit={(id, atMs) => onCaptionSplit?.(id, atMs)}
						onCaptionMerge={(idA, idB) => onCaptionMerge?.(idA, idB)}
						onCaptionDelete={(id) => onCaptionDelete?.(id)}
					/>
				) : (
					<div className="rounded-lg bg-foreground/[0.03] px-2.5 py-6 text-center">
						<p className="text-xs text-muted-foreground">
							{tSettings(
								"captions.selectOnTimeline",
								"Select a caption on the timeline to edit it.",
							)}
						</p>
					</div>
				)}
			</section>
		);

		switch (activeEffectSection) {
			case "settings":
				return settingsSectionContent;
			case "scene":
				return sceneSectionContent;
			case "zoom":
				return zoomItemSectionContent;
			case "clip":
				return clipSectionContent;
			case "audio":
				return audioSectionContent;
			case "frame":
				return sceneSectionContent;
			case "crop":
				return sceneSectionContent;
			case "captions":
				return captionsSectionContent;
			case "caption":
				return captionSectionContent;
			case "cursor":
				return (
					<section className="flex flex-col gap-4">
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between gap-3">
								<SectionLabel>
									{tSettings("sections.appearance", "Appearance")}
								</SectionLabel>
								<Button
									variant="ghost"
									size="sm"
									className="text-xs text-muted"
									type="button"
									onClick={resetCursorSection}
								>
									{t("common.actions.reset", "Reset")}
								</Button>
							</div>
							{advanced && (
								<div className="flex flex-col gap-3">
									<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
										<span>{tSettings("effects.showCursor")}</span>
										<Switch
											aria-label={tSettings("effects.showCursor")}
											checked={showCursor}
											onCheckedChange={onShowCursorChange}
										/>
									</label>
									<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
										<span>{tSettings("effects.loopCursor")}</span>
										<Switch
											aria-label={tSettings("effects.loopCursor")}
											checked={loopCursor}
											onCheckedChange={onLoopCursorChange}
										/>
									</label>
								</div>
							)}
						</div>
						<div className="flex flex-col gap-3">
							<div className="space-y-1.5">
								<ChoiceGroup
									type="single"
									value={cursorStyle}
									onValueChange={(value) => {
										if (value) {
											onCursorStyleChange?.(value as CursorStyle);
										}
									}}
									className="grid grid-cols-4 gap-2"
									aria-label={tSettings("effects.cursorStyle", "Cursor Style")}
								>
									{cursorStyleOptions.map((option) => (
										<ChoiceItem
											key={option.value}
											value={option.value}
											title={tSettings(`effects.cursorStyleOptions.${option.value}`, option.label)}
											aria-label={tSettings(`effects.cursorStyleOptions.${option.value}`, option.label)}
											className={cn(
												"group aspect-square h-auto min-w-0 p-3 text-left",
											)}
										>
											<div className="flex h-full flex-col items-center justify-between gap-3">
												<div className="flex min-h-0 flex-1 items-center justify-center rounded-lg px-2 py-1.5">
													<CursorStylePreview
														style={option.value}
														previewUrls={cursorPreviewUrls}
													/>
												</div>
											</div>
										</ChoiceItem>
									))}
								</ChoiceGroup>
							</div>
							<SliderControl
								label={tSettings("effects.cursorSize")}
								value={cursorSize}
								min={0.5}
								max={10}
								step={0.05}
								onChange={(v) => onCursorSizeChange?.(v)}
								formatValue={(v) => `${v.toFixed(2)}×`}
							/>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>{tSettings("effects.hideIdleCursor")}</span>
								<Switch
									aria-label={tSettings("effects.hideIdleCursor")}
									checked={cursorExtras.hideIdleCursor}
									onCheckedChange={(hideIdleCursor) =>
										onCursorExtrasChange?.({ hideIdleCursor })
									}
								/>
							</label>
							{cursorExtras.hideIdleCursor && (
								<SliderControl
									label={tSettings("effects.idleCursorDelay")}
									value={cursorExtras.idleCursorDelaySec}
									min={0.5}
									max={10}
									step={0.5}
									onChange={(idleCursorDelaySec) =>
										onCursorExtrasChange?.({ idleCursorDelaySec })
									}
									formatValue={(v) => `${v.toFixed(1)}s`}
								/>
							)}
							<CursorClickEffectCards
								title={tSettings(
									"effects.cursorClickEffects.title",
									"Click Effects",
								)}
								activeEffectId={cursorClickEffect}
								effectColor={cursorClickEffectColor}
								onApply={(effectId) => onCursorClickEffectChange?.(effectId)}
								tSettings={tSettings}
							/>
							{advanced ? (
								<div className="grid gap-3">
									<div className="grid gap-1">
										<div className="text-xs text-muted-foreground">
											{tSettings(
												"effects.cursorClickEffects.color",
												"Effect Color",
											)}
										</div>
										<div className="flex flex-col gap-3">
											<ColorPalette
												color={cursorClickEffectColor}
												colors={CLICK_EFFECT_COLOR_OPTIONS}
												onChange={({ hex }) =>
													onCursorClickEffectColorChange?.(hex)
												}
											/>
											<ColorControl
												label={tSettings("effects.customEffectColor", "Custom effect color")}
												value={cursorClickEffectColor}
												onChange={(color) =>
													onCursorClickEffectColorChange?.(color)
												}
											/>
										</div>
									</div>
									<SliderControl
										label={tSettings(
											"effects.cursorClickEffects.size",
											"Effect Size",
										)}
										value={cursorClickEffectScale}
										min={0.5}
										max={2}
										step={0.05}
										onChange={(v) => onCursorClickEffectScaleChange?.(v)}
										formatValue={(v) => `${v.toFixed(2)}×`}
									/>
									<SliderControl
										label={tSettings(
											"effects.cursorClickEffects.opacity",
											"Effect Opacity",
										)}
										value={cursorClickEffectOpacity}
										min={0}
										max={1}
										step={0.01}
										onChange={(v) => onCursorClickEffectOpacityChange?.(v)}
										formatValue={(v) => `${Math.round(v * 100)}%`}
									/>
									<SliderControl
										label={tSettings(
											"effects.cursorClickEffects.duration",
											"Effect Duration",
										)}
										value={cursorClickEffectDurationMs}
										min={120}
										max={1200}
										step={10}
										onChange={(v) => onCursorClickEffectDurationMsChange?.(v)}
										formatValue={(v) => `${Math.round(v)} ms`}
									/>
								</div>
							) : null}
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>{tSettings("effects.clickSound")}</span>
								<Switch
									aria-label={tSettings("effects.clickSound")}
									checked={cursorExtras.clickSound}
									onCheckedChange={(clickSound) => onCursorExtrasChange?.({ clickSound })}
								/>
							</label>
							{cursorExtras.clickSound && (
								<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
									<span>{tSettings("effects.clickSoundType", "Sound")}</span>
									<Select
										value={cursorExtras.clickSoundType}
										onValueChange={(value) => {
											const clickSoundType = value as ClickSoundId;
											onCursorExtrasChange?.({ clickSoundType });
											// Audition the picked sound, like Screen Studio's preview on select.
											playPreviewClickSound(
												Math.max(0.3, cursorExtras.clickSoundVolume),
												clickSoundType,
											);
										}}
									>
										<SelectTrigger className="h-8 w-[140px] text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CLICK_SOUND_IDS.map((id) => (
												<SelectItem key={id} value={id}>
													{tSettings(`effects.clickSoundTypes.${id}`, id)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>
							)}
							{cursorExtras.clickSound && (
								<SliderControl
									label={tSettings("effects.clickSoundVolume")}
									value={cursorExtras.clickSoundVolume}
									min={0}
									max={1}
									step={0.05}
									onChange={(clickSoundVolume) =>
										onCursorExtrasChange?.({ clickSoundVolume })
									}
									formatValue={(v) => `${Math.round(v * 100)}%`}
								/>
							)}
							<SliderControl
								label={tSettings("effects.cursorClickBounce")}
								value={cursorClickBounce}
								min={0}
								max={5}
								step={0.05}
								onChange={(v) => onCursorClickBounceChange?.(v)}
								formatValue={(v) => `${v.toFixed(2)}×`}
							/>
							{advanced && (
								<SliderControl
									label={tSettings(
										"effects.cursorClickBounceDuration",
										"Bounce Speed",
									)}
									value={cursorClickBounceDuration}
									min={60}
									max={500}
									step={5}
									onChange={(v) => onCursorClickBounceDurationChange?.(v)}
									formatValue={(v) => `${Math.round(v)} ms`}
								/>
							)}
							{advanced && (
								<SliderControl
									label={tSettings("effects.cursorSway")}
									value={toCursorSwaySliderValue(cursorSway)}
									min={0}
									max={toCursorSwaySliderValue(2)}
									step={toCursorSwaySliderValue(0.05)}
									onChange={(v) =>
										onCursorSwayChange?.(fromCursorSwaySliderValue(v))
									}
									formatValue={(v) =>
										v <= 0 ? tSettings("effects.off") : `${v.toFixed(2)}×`
									}
								/>
							)}
							{advanced && showDevMotionControls ? (
								<div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
									<div className="text-xs text-muted-foreground">
										{tSettings(
											"effects.cursorDebugMovedToDev",
											"Cursor spring tuning is available in Settings > Dev.",
										)}
									</div>
								</div>
							) : null}
						</div>
						<div className="flex flex-col gap-3">
							<SectionLabel>{tSettings("shortcuts.title")}</SectionLabel>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>{tSettings("shortcuts.show")}</span>
								<Switch
									aria-label={tSettings("shortcuts.show")}
									checked={cursorExtras.showShortcuts}
									onCheckedChange={(showShortcuts) =>
										onCursorExtrasChange?.({ showShortcuts })
									}
								/>
							</label>
							{!hasRecordedShortcuts && (
								<p className="text-xs text-muted-foreground/70">
									{tSettings("shortcuts.noneRecorded")}
								</p>
							)}
							{cursorExtras.showShortcuts && (
								<>
									<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
										<span>{tSettings("shortcuts.singleKeys")}</span>
										<Switch
											aria-label={tSettings("shortcuts.singleKeys")}
											checked={cursorExtras.showSingleKeyShortcuts}
											onCheckedChange={(showSingleKeyShortcuts) =>
												onCursorExtrasChange?.({ showSingleKeyShortcuts })
											}
										/>
									</label>
									<SliderControl
										label={tSettings("shortcuts.size")}
										value={cursorExtras.shortcutsSize}
										min={0.5}
										max={2}
										step={0.05}
										onChange={(shortcutsSize) =>
											onCursorExtrasChange?.({ shortcutsSize })
										}
										formatValue={(v) => `${v.toFixed(2)}×`}
									/>
									<ChoiceGroup
										type="single"
										value={cursorExtras.shortcutsPosition}
										onValueChange={(value) => {
											if (value) {
												onCursorExtrasChange?.({
													shortcutsPosition: value as ShortcutOverlayPosition,
												});
											}
										}}
										className="grid grid-cols-3 gap-2"
										aria-label={tSettings("shortcuts.position")}
									>
										{(["bottom-left", "bottom-center", "bottom-right"] as const).map(
											(position) => (
												<ChoiceItem
													key={position}
													value={position}
													className="h-auto min-w-0 px-2 py-2 text-xs"
												>
													{tSettings(`shortcuts.positions.${position}`)}
												</ChoiceItem>
											),
										)}
									</ChoiceGroup>
								</>
							)}
						</div>
					</section>
				);
			case "webcam":
				return (
					<section className="flex flex-col gap-4">
						<div className="flex items-center justify-between gap-3">
							<SectionLabel>
								{tSettings("sections.appearance", "Appearance")}
							</SectionLabel>
							<Button
								variant="ghost"
								size="sm"
								className="text-xs text-muted"
								type="button"
								onClick={resetWebcamSection}
							>
								{t("common.actions.reset", "Reset")}
							</Button>
						</div>
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between py-2">
								<span className="text-xs text-muted-foreground">
									{tSettings("effects.show", "Show")}
								</span>
								<Switch
									aria-label={tSettings("effects.show", "Show")}
									checked={webcam?.enabled ?? false}
									onCheckedChange={(enabled) => updateWebcam({ enabled })}
								/>
							</div>
							<div className="flex items-center justify-between py-2">
								<span className="text-xs text-muted-foreground">
									{tSettings("effects.webcamRemoveBackground", "Remove background")}
								</span>
								<Switch
									aria-label={tSettings(
										"effects.webcamRemoveBackground",
										"Remove background",
									)}
									checked={webcam?.backgroundRemoval ?? false}
									onCheckedChange={(backgroundRemoval) =>
										updateWebcam({ backgroundRemoval })
									}
								/>
							</div>
							{webcam?.backgroundRemoval ? (
								<div className="flex flex-col gap-2">
									<ChoiceGroup
										aria-label={tSettings("effects.webcamQuality", "Cutout quality")}
										value={webcam.backgroundRemovalQuality ?? "fast"}
										onValueChange={(value) =>
											updateWebcam({
												backgroundRemovalQuality: value as "fast" | "high",
											})
										}
										className="grid grid-cols-2 gap-2"
									>
										<ChoiceItem value="fast" textValue="fast">
											{tSettings("effects.webcamQualityFast", "Fast")}
										</ChoiceItem>
										<ChoiceItem value="high" textValue="high">
											{tSettings("effects.webcamQualityHigh", "High quality (slow)")}
										</ChoiceItem>
									</ChoiceGroup>
									{webcam.backgroundRemovalQuality === "high" ? (
										<p className="text-xs text-muted-foreground/70">
											{tSettings(
												"effects.webcamQualityHint",
												"High quality is used when exporting only and takes several seconds per second of camera video; the preview stays fast. First use downloads about 0.2 GB.",
											)}
										</p>
									) : null}
									<ChoiceGroup
										aria-label={tSettings(
											"effects.webcamBackgroundStyle",
											"Background",
										)}
										value={webcam.backgroundStyle ?? "transparent"}
										onValueChange={(value) =>
											updateWebcam({
												backgroundStyle: value as WebcamBackgroundStyle,
											})
										}
										className="grid grid-cols-3 gap-2"
									>
										<ChoiceItem value="transparent" textValue="transparent">
											{tSettings("effects.webcamBackgroundNone", "None")}
										</ChoiceItem>
										<ChoiceItem value="blur" textValue="blur">
											{tSettings("effects.webcamBackgroundBlur", "Blur")}
										</ChoiceItem>
										<ChoiceItem value="color" textValue="color">
											{tSettings("effects.webcamBackgroundColor", "Color")}
										</ChoiceItem>
									</ChoiceGroup>
									{webcam.backgroundStyle === "color" ? (
										<ColorControl
											compact
											label={tSettings(
												"effects.webcamBackgroundColor",
												"Color",
											)}
											value={webcam.backgroundColor ?? "#FFFFFF"}
											onChange={(backgroundColor) =>
												updateWebcam({ backgroundColor })
											}
										/>
									) : null}
								</div>
							) : null}
							<div className="flex items-center justify-between py-2">
								<span className="text-xs text-muted-foreground">
									{tSettings("effects.webcamFaceTracking", "Face tracking")}
								</span>
								<Switch
									aria-label={tSettings("effects.webcamFaceTracking", "Face tracking")}
									checked={webcam?.faceTracking ?? false}
									onCheckedChange={(faceTracking) => updateWebcam({ faceTracking })}
								/>
							</div>
							{(webcam?.backgroundRemoval || webcam?.faceTracking) &&
							(cameraAiStatus === "loading" || cameraAiStatus === "error") ? (
								<p className="text-xs text-muted-foreground/70">
									{cameraAiStatus === "loading"
										? tSettings(
												"effects.cameraAiLoading",
												"Preparing camera AI (one-time download, about 14 MB)…",
											)
										: tSettings(
												"effects.cameraAiFailed",
												"Couldn't load camera AI. Check your internet connection and try again.",
											)}
								</p>
							) : null}
							<div className="flex items-center justify-between gap-3 py-2">
								<span className="text-xs text-muted-foreground">
									{tSettings("effects.webcamAvoidCursor", "Move away from cursor")}
								</span>
								<Switch
									aria-label={tSettings("effects.webcamAvoidCursor", "Move away from cursor")}
									checked={webcam?.avoidCursor ?? true}
									onCheckedChange={(avoidCursor) => updateWebcam({ avoidCursor })}
								/>
							</div>
							<div className="flex items-center justify-between gap-3 py-2">
								<span className="text-xs text-muted-foreground">
									{tSettings("effects.webcamHideWhenSilent", "Hide during silence")}
								</span>
								<Switch
									aria-label={tSettings("effects.webcamHideWhenSilent", "Hide during silence")}
									checked={webcam?.hideWhenSilent ?? false}
									onCheckedChange={(hideWhenSilent) => updateWebcam({ hideWhenSilent })}
								/>
							</div>
							{advanced && (
								<>
									<div className="flex items-center justify-between py-2">
										<span className="text-xs text-muted-foreground">
											{tSettings("effects.webcamReactToZoom")}
										</span>
										<Switch
											aria-label={tSettings("effects.webcamReactToZoom")}
											checked={
												webcam?.reactToZoom ?? DEFAULT_WEBCAM_REACT_TO_ZOOM
											}
											onCheckedChange={(reactToZoom) =>
												updateWebcam({ reactToZoom })
											}
										/>
									</div>
									<div className="flex items-center justify-between py-2">
										<span className="text-xs text-muted-foreground">
											{tSettings("effects.webcamMirror", "Mirror webcam")}
										</span>
										<Switch
											aria-label={tSettings(
												"effects.webcamMirror",
												"Mirror webcam",
											)}
											checked={webcam?.mirror ?? true}
											onCheckedChange={(mirror) => updateWebcam({ mirror })}
										/>
									</div>
								</>
							)}
							<SliderControl
								label={tSettings("effects.webcamWidth", "Webcam Width")}
								value={webcamWidth}
								min={10}
								max={100}
								step={1}
								onChange={(v) => updateWebcam({ width: v, size: v })}
								formatValue={(v) => `${Math.round(v)}%`}
							/>
							{advanced && (
								<SliderControl
									label={tSettings("effects.webcamHeight", "Webcam Height")}
									value={webcamHeight}
									min={10}
									max={100}
									step={1}
									onChange={(v) => updateWebcam({ height: v })}
									formatValue={(v) => `${Math.round(v)}%`}
								/>
							)}
							{advanced && (
								<div className="py-2">
									<div className="mb-2 flex items-center justify-between gap-2">
										<div className="text-xs text-muted-foreground">
											{tSettings("effects.webcamCrop", "Crop")}
										</div>
										<Button
											className="text-xs text-muted"
											size="sm"
											variant="ghost"
											type="button"
											onClick={() =>
												updateWebcam({ cropRegion: DEFAULT_CROP_REGION })
											}
										>
											{t("common.actions.reset", "Reset")}
										</Button>
									</div>
									<div className="mx-auto w-full max-w-56">
										<WebcamCropControl
											cropRegion={webcamCrop}
											mirrored={webcam?.mirror ?? true}
											previewSrc={webcamPreviewSrc}
											previewCurrentTime={webcamPreviewCurrentTime}
											previewPlaying={webcamPreviewPlaying}
											previewTimeOffsetMs={webcam?.timeOffsetMs}
											onCropChange={(cropRegion, previewFrame) =>
												updateWebcam({
													cropRegion,
													height: previewFrame
														? getCropMatchedWebcamHeightPercent(
																webcamWidth,
																webcamHeight,
																previewFrame.width,
																previewFrame.height,
																cropRegion,
															)
														: webcamHeight,
												})
											}
										/>
									</div>
								</div>
							)}
							<div className="py-2">
								<div className="mb-2 text-xs text-muted-foreground">
									{tSettings("effects.webcamPosition", "Position")}
								</div>
								<ChoiceGroup
									aria-label={tSettings("effects.webcamPosition", "Position")}
									value={webcamPositionPreset}
									onValueChange={(value) =>
										applyWebcamPositionPreset(value as WebcamPositionPreset)
									}
									className="grid grid-cols-3 gap-2"
								>
									{WEBCAM_POSITION_PRESETS.map((option) => (
										<ChoiceItem
											key={option.preset}
											value={option.preset}
											textValue={option.preset}
										>
											{option.label}
										</ChoiceItem>
									))}
								</ChoiceGroup>
								{advanced && (
									<div className="mt-2 flex items-center justify-between py-3">
										<span className="text-xs text-muted-foreground">
											{tSettings(
												"effects.webcamCustomPosition",
												"Custom position",
											)}
										</span>
										<Switch
											aria-label={tSettings(
												"effects.webcamCustomPosition",
												"Custom position",
											)}
											checked={webcamPositionPreset === "custom"}
											onCheckedChange={(checked) =>
												applyWebcamPositionPreset(
													checked
														? "custom"
														: DEFAULT_WEBCAM_POSITION_PRESET,
												)
											}
										/>
									</div>
								)}
							</div>
							{advanced && webcamPositionPreset === "custom" ? (
								<>
									<SliderControl
										label={tSettings("effects.webcamHorizontal", "Horizontal")}
										value={webcamPositionX * 100}
										min={0}
										max={100}
										step={1}
										onChange={(v) =>
											updateWebcam({
												positionPreset: "custom",
												positionX: v / 100,
											})
										}
										formatValue={(v) => `${Math.round(v)}%`}
									/>
									<SliderControl
										label={tSettings("effects.webcamVertical", "Vertical")}
										value={webcamPositionY * 100}
										min={0}
										max={100}
										step={1}
										onChange={(v) =>
											updateWebcam({
												positionPreset: "custom",
												positionY: v / 100,
											})
										}
										formatValue={(v) => `${Math.round(v)}%`}
									/>
								</>
							) : null}
							{advanced && (
								<SliderControl
									label={tSettings("effects.webcamMargin", "Margin")}
									value={webcam?.margin ?? DEFAULT_WEBCAM_MARGIN}
									min={0}
									max={96}
									step={1}
									onChange={(v) => updateWebcam({ margin: v })}
									formatValue={(v) => `${Math.round(v)}px`}
								/>
							)}
							<SliderControl
								label={tSettings("effects.webcamRoundness")}
								value={webcam?.roundness ?? DEFAULT_WEBCAM_ROUNDNESS}
								min={0}
								max={100}
								step={1}
								onChange={(v) => updateWebcam({ roundness: v })}
								formatValue={(v) => `${Math.round(v)}%`}
							/>
							{advanced && (
								<SliderControl
									label={tSettings("effects.webcamShadow")}
									value={webcam?.shadow ?? DEFAULT_WEBCAM_SHADOW}
									min={0}
									max={1}
									step={0.01}
									onChange={(v) => updateWebcam({ shadow: v })}
									formatValue={(v) => `${Math.round(v * 100)}%`}
								/>
							)}
							<ColorLookControl
								source="camera"
								value={colorGrading.camera}
								onChange={(camera) => onColorGradingChange?.({ ...colorGrading, camera })}
							/>
							<SliderControl
								label={tSettings("looks.sharpness", "Sharpness")}
								value={colorGrading.cameraSharpness}
								min={0}
								max={1}
								step={0.01}
								onChange={(cameraSharpness) =>
									onColorGradingChange?.({ ...colorGrading, cameraSharpness })
								}
								formatValue={(v) => `${Math.round(v * 100)}%`}
							/>
							<div className="py-2">
								<div className="flex flex-col gap-4">
									<div className="min-w-0">
										<div className="text-xs text-muted-foreground">
											{tSettings("effects.webcamFootage")}
										</div>
										<div className="mt-0.5 break-all text-xs leading-4 text-muted-foreground/70">
											{webcamFileName ??
												tSettings("effects.webcamFootageDescription")}
										</div>
									</div>
									<div className="grid grid-cols-1 gap-2">
										<Button
											type="button"
											variant="outline"
											onClick={onUploadWebcam}
											className="h-9 w-full min-w-0 justify-start gap-2 px-3"
										>
											<Upload className="h-3 w-3" />
											<span className="min-w-0 truncate">
												{webcam?.sourcePath
													? tSettings("effects.replaceWebcamFootage")
													: tSettings("effects.uploadWebcamFootage")}
											</span>
										</Button>
										{webcam?.sourcePath ? (
											<Button
												type="button"
												variant="outline"
												onClick={onClearWebcam}
												className="h-9 w-full min-w-0 justify-start gap-2 px-3"
											>
												<Trash2 className="h-3 w-3" />
												<span className="min-w-0 truncate">
													{tSettings("effects.removeWebcamFootage")}
												</span>
											</Button>
										) : null}
									</div>
								</div>
							</div>
						</div>
					</section>
				);
			default: {
				return sceneSectionContent;
			}
		}
	})();

	return (
		<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-none bg-transparent p-0 shadow-none">
			<div
				data-testid="settings-scroll"
					className="settings-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pb-8 pt-1"
				style={{ scrollbarGutter: "stable" }}
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeEffectSection}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						{effectSectionContent}
					</motion.div>
				</AnimatePresence>
			</div>

			<div
				className={cn(
					"shrink-0 px-5 py-4",
					(() => {
						if (activeEffectSection === "clip" && selectedClipId) return false;
						if (activeEffectSection === "zoom" && selectedZoomId) return false;
						if (activeEffectSection === "audio" && selectedAudioId) return false;
						if (selectedAnnotationId) return false; // Annotation editor handles its own but let's see
						return true;
					})() && "hidden",
				)}
			>
				{activeEffectSection === "clip" && selectedClipId && (
					<Button
						onClick={() => {
							if (selectedClipId && onClipDelete) onClipDelete(selectedClipId);
						}}
						variant="destructive-soft"
						size="sm"
						className="h-9 w-full gap-2 text-xs"
					>
						<Trash2 className="h-3 w-3" />
						{tSettings("clip.delete", "Delete Clip")}
					</Button>
				)}
				{activeEffectSection === "zoom" && selectedZoomId && (
					<Button
						onClick={() => {
							if (selectedZoomId && onZoomDelete) onZoomDelete(selectedZoomId);
						}}
						variant="destructive-soft"
						size="sm"
						className="h-9 w-full gap-2 text-xs"
					>
						<Trash2 className="h-3 w-3" />
						{tSettings("zoom.deleteZoom", "Delete Zoom")}
					</Button>
				)}
				{activeEffectSection === "audio" && selectedAudioId && (
					<Button
						onClick={() => {
							if (selectedAudioId && onAudioDelete) onAudioDelete(selectedAudioId);
						}}
						variant="destructive-soft"
						size="sm"
						className="h-9 w-full gap-2 text-xs"
					>
						<Trash2 className="h-3 w-3" />
						{tSettings("audio.deleteRegion", "Delete Audio")}
					</Button>
				)}
				{selectedAnnotationId && (
					<Button
						onClick={() => {
							if (selectedAnnotationId && onAnnotationDelete)
								onAnnotationDelete(selectedAnnotationId);
						}}
						variant="destructive-soft"
						size="sm"
						className="h-9 w-full gap-2 text-xs"
					>
						<Trash2 className="h-3 w-3" />
						{tSettings("annotation.delete", "Delete Annotation")}
					</Button>
				)}
			</div>
		</Card>
	);
}
