import { Copy, DownloadSimple, GearSix, PencilSimple, XIcon } from "@/components/ui/icons";
import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import { getRenderableVideoUrl } from "@/lib/assetPath";
import { OPEN_EDITOR_ON_WIDGET_CLOSE_KEY, shouldOpenEditorOnWidgetClose } from "./quickExportClose";
import "./launchTheme.css";

// Read by electron/captureExtras.ts (see electron/quickExportSettings.ts).
const QUICK_EXPORT_SETTINGS_KEY = "recordly.quickExport.settings";
type QuickExportSettings = { format: "mp4" | "gif"; quality: "720p" | "1080p" | "original" };
const FORMATS = [
	{ value: "mp4", label: "MP4" },
	{ value: "gif", label: "GIF" },
] as const;
const QUALITIES = [
	{ value: "720p", label: "720p" },
	{ value: "1080p", label: "1080p" },
	{ value: "original", label: null },
] as const;

function loadQuickExportSettings(): QuickExportSettings {
	const raw = loadAppSetting<Partial<QuickExportSettings>>(QUICK_EXPORT_SETTINGS_KEY) ?? {};
	return {
		format: raw.format === "gif" ? "gif" : "mp4",
		quality: raw.quality === "720p" || raw.quality === "1080p" ? raw.quality : "original",
	};
}

/** Screen Studio-style quick export widget shown right after a recording stops. */
export function QuickExportWidget() {
	const t = useScopedT("launch");
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settings, setSettings] = useState(loadQuickExportSettings);

	// [x] (also after Save) opens the editor like Edit, unless the setting is off.
	const close = useCallback(() => {
		if (shouldOpenEditorOnWidgetClose(loadAppSetting<boolean>(OPEN_EDITOR_ON_WIDGET_CLOSE_KEY))) {
			void window.electronAPI.switchToEditor().then(() =>
				window.electronAPI.quickExportClose({ toEditor: true }),
			);
		} else {
			void window.electronAPI.quickExportClose();
		}
	}, []);

	useEffect(() => {
		void window.electronAPI.quickExportGetVideo().then(async (videoPath) => {
			if (videoPath) setVideoUrl(await getRenderableVideoUrl(videoPath));
		});
	}, []);

	const updateSettings = (patch: Partial<QuickExportSettings>) => {
		setSettings((current) => {
			const next = { ...current, ...patch };
			saveAppSetting(QUICK_EXPORT_SETTINGS_KEY, next);
			return next;
		});
	};
	// The original MP4 is handed out as is; anything else is encoded first.
	const showExporting = () => {
		if (settings.format !== "mp4" || settings.quality !== "original")
			setStatus(t("quickExport.exporting", "Exporting…"));
	};

	const edit = async () => {
		await window.electronAPI.switchToEditor();
		void window.electronAPI.quickExportClose({ toEditor: true });
	};
	const save = async () => {
		showExporting();
		const result = await window.electronAPI.quickExportSave();
		setStatus(
			result.success
				? t("quickExport.saved", "Saved")
				: result.canceled
					? null
					: t("quickExport.saveFailed", "Couldn’t save"),
		);
	};
	const copy = async () => {
		showExporting();
		const result = await window.electronAPI.quickExportCopy();
		setStatus(
			result.success
				? t("quickExport.copied", "Copied to clipboard")
				: t("quickExport.copyFailed", "Couldn’t copy"),
		);
	};

	const actionClass =
		"flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium text-[var(--launch-text)] transition-colors hover:bg-[var(--launch-hover)]";
	const chipClass = (active: boolean) =>
		`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
			active ? "bg-white text-black" : "text-white/80 hover:bg-white/15"
		}`;

	return (
		<div
			className="launch-theme h-screen w-screen p-2"
		>
			<div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--launch-bar-border)] bg-[var(--launch-bar-bg)] p-2 shadow-[var(--launch-bar-shadow)]">
				<div
					className="group relative flex-1 cursor-pointer overflow-hidden rounded-xl bg-black"
					title={t("quickExport.doubleClickToEdit", "Double-click to open in the editor")}
					onDoubleClick={() => void edit()}
				>
					{videoUrl ? (
						<video
							src={videoUrl}
							className="h-full w-full object-contain"
							muted
							autoPlay
							loop
							playsInline
						/>
					) : null}
					<button
						type="button"
						aria-label={t("quickExport.settings", "Quick export settings")}
						title={t("quickExport.settings", "Quick export settings")}
						aria-expanded={settingsOpen}
						className="absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-80 hover:opacity-100"
						onClick={() => setSettingsOpen(!settingsOpen)}
						onDoubleClick={(event) => event.stopPropagation()}
					>
						<GearSix size={14} />
					</button>
					<button
						type="button"
						aria-label={t("quickExport.close", "Close")}
						title={t("quickExport.close", "Close")}
						className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-80 hover:opacity-100"
						onClick={close}
					>
						<XIcon size={14} />
					</button>
					{settingsOpen ? (
						<div
							className="absolute inset-0 flex cursor-default flex-col justify-center gap-2 bg-black/80 px-3 pt-6 text-white"
							onDoubleClick={(event) => event.stopPropagation()}
						>
							<div className="text-[11px] font-semibold">
								{t("quickExport.settings", "Quick export settings")}
							</div>
							<div className="flex items-center gap-2">
								<span className="w-12 shrink-0 text-[11px] text-white/60">
									{t("quickExport.format", "Format")}
								</span>
								{FORMATS.map((option) => (
									<button
										key={option.value}
										type="button"
										className={chipClass(settings.format === option.value)}
										onClick={() => updateSettings({ format: option.value })}
									>
										{option.label}
									</button>
								))}
							</div>
							<div className="flex items-center gap-2">
								<span className="w-12 shrink-0 text-[11px] text-white/60">
									{t("quickExport.quality", "Quality")}
								</span>
								{QUALITIES.map((option) => (
									<button
										key={option.value}
										type="button"
										className={chipClass(settings.quality === option.value)}
										onClick={() => updateSettings({ quality: option.value })}
									>
										{option.label ?? t("quickExport.original", "Original")}
									</button>
								))}
							</div>
						</div>
					) : null}
					{status ? (
						<div className="absolute inset-x-0 bottom-0 z-10 bg-black/60 py-1 text-center text-[11px] text-white">
							{status}
						</div>
					) : null}
				</div>
				<div className="mt-1.5 flex gap-1">
					<button type="button" className={actionClass} onClick={() => void save()}>
						<DownloadSimple size={18} />
						{t("quickExport.save", "Save")}
					</button>
					<button type="button" className={actionClass} onClick={() => void copy()}>
						<Copy size={18} />
						{t("quickExport.copy", "Copy")}
					</button>
					<button type="button" className={actionClass} onClick={() => void edit()}>
						<PencilSimple size={18} />
						{t("quickExport.edit", "Edit")}
					</button>
				</div>
			</div>
		</div>
	);
}
