import { BoundingBox, EyeSlash, FilmStrip } from "@/components/ui/icons";
import { type ReactElement, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import styles from "../LaunchWindow.module.css";
import { useLaunchPopoverCoordinator } from "./LaunchPopoverCoordinator";
import { DropdownItem, HudPopover } from "./PopoverScaffold";

// Read by electron/captureExtras.ts.
const HIDE_DESKTOP_ICONS_SETTING_KEY = "recordly.recording.hideDesktopIcons";
const QUICK_EXPORT_WIDGET_SETTING_KEY = "recordly.recording.showQuickExportWidget";

const SETTINGS_POPOVER_ID = "recording-settings";
const WINDOW_SIZE_POPOVER_ID = "window-size";

// Visible window frame in physical pixels, i.e. the recorded size.
export const WINDOW_SIZE_PRESETS = [
	{ width: 1280, height: 720, key: "hd", fallback: "720p (16:9)" },
	{ width: 1920, height: 1080, key: "fullHd", fallback: "1080p (16:9)" },
	{ width: 1440, height: 900, key: "wide", fallback: "16:10" },
	{ width: 1080, height: 1920, key: "vertical", fallback: "Vertical (9:16)" },
] as const;

/** Gear at the right of the recording bar, like Screen Studio's recording picker settings. */
export function RecordingSettingsPopover({
	trigger,
	platform,
}: {
	trigger: ReactElement;
	platform: string | null;
}) {
	const t = useScopedT("launch");
	const { isOpen, requestOpen, requestClose } = useLaunchPopoverCoordinator();
	const [hideDesktopIcons, setHideDesktopIcons] = useState(
		() => loadAppSetting<boolean>(HIDE_DESKTOP_ICONS_SETTING_KEY) === true,
	);
	// On by default, as in Screen Studio.
	const [showQuickExport, setShowQuickExport] = useState(
		() => loadAppSetting<boolean>(QUICK_EXPORT_WIDGET_SETTING_KEY) !== false,
	);

	return (
		<HudPopover
			open={isOpen(SETTINGS_POPOVER_ID)}
			onOpenChange={(next) =>
				next ? requestOpen(SETTINGS_POPOVER_ID) : requestClose(SETTINGS_POPOVER_ID)
			}
			trigger={trigger}
			align="end"
		>
			<div className={styles.ddLabel}>
				{t("recordingSettings.title", "Recording settings")}
			</div>
			<DropdownItem
				icon={<FilmStrip size={16} />}
				selected={showQuickExport}
				onClick={() => {
					setShowQuickExport(!showQuickExport);
					saveAppSetting(QUICK_EXPORT_WIDGET_SETTING_KEY, !showQuickExport);
				}}
			>
				{t("recordingSettings.showQuickExport", "Show quick export widget after recording")}
			</DropdownItem>
			{platform === "win32" ? (
				<DropdownItem
					icon={<EyeSlash size={16} />}
					selected={hideDesktopIcons}
					onClick={() => {
						setHideDesktopIcons(!hideDesktopIcons);
						saveAppSetting(HIDE_DESKTOP_ICONS_SETTING_KEY, !hideDesktopIcons);
					}}
				>
					{t("recordingSettings.hideDesktopIcons", "Hide desktop icons while recording")}
				</DropdownItem>
			) : null}
		</HudPopover>
	);
}

/** Shown next to the source button when a window is selected: resize it to an exact size. */
export function WindowSizePopover({ trigger }: { trigger: ReactElement }) {
	const t = useScopedT("launch");
	const { isOpen, requestOpen, requestClose } = useLaunchPopoverCoordinator();
	const [result, setResult] = useState<string | null>(null);

	const resize = async (width: number, height: number) => {
		const response = await window.electronAPI.resizeSelectedWindow(width, height);
		if (!response.success) {
			setResult(t("windowSize.failed", "Couldn’t resize this window"));
			return;
		}
		// Windows may clamp the size (screen too small, or the app sets limits).
		setResult(
			response.width === width && response.height === height
				? null
				: t(
						"windowSize.clamped",
						"Resized to {{width}}×{{height}} (limited by the screen or app)",
						{
							width: response.width ?? 0,
							height: response.height ?? 0,
						},
					),
		);
		if (response.width === width && response.height === height)
			requestClose(WINDOW_SIZE_POPOVER_ID);
	};

	return (
		<HudPopover
			open={isOpen(WINDOW_SIZE_POPOVER_ID)}
			onOpenChange={(next) => {
				setResult(null);
				if (next) requestOpen(WINDOW_SIZE_POPOVER_ID);
				else requestClose(WINDOW_SIZE_POPOVER_ID);
			}}
			trigger={trigger}
			align="start"
		>
			<div className={styles.ddLabel}>{t("windowSize.title", "Resize window")}</div>
			{WINDOW_SIZE_PRESETS.map((preset) => (
				<DropdownItem
					key={preset.key}
					icon={<BoundingBox size={16} />}
					onClick={() => void resize(preset.width, preset.height)}
					trailing={
						<span className="ml-auto pl-3 text-xs tabular-nums opacity-60">
							{preset.width}×{preset.height}
						</span>
					}
				>
					{t(`windowSize.${preset.key}`, preset.fallback)}
				</DropdownItem>
			))}
			{result ? <div className={styles.ddLabel}>{result}</div> : null}
		</HudPopover>
	);
}
