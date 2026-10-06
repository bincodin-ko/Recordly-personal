import { Copy, DownloadSimple, PencilSimple, XIcon } from "@/components/ui/icons";
import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { getRenderableVideoUrl } from "@/lib/assetPath";
import "./launchTheme.css";

/** Screen Studio-style quick export widget shown right after a recording stops. */
export function QuickExportWidget() {
	const t = useScopedT("launch");
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	const close = useCallback(() => void window.electronAPI.quickExportClose(), []);

	useEffect(() => {
		void window.electronAPI.quickExportGetVideo().then(async (videoPath) => {
			if (videoPath) setVideoUrl(await getRenderableVideoUrl(videoPath));
		});
	}, []);

	const edit = async () => {
		await window.electronAPI.switchToEditor();
		void window.electronAPI.quickExportClose({ toEditor: true });
	};
	const save = async () => {
		const result = await window.electronAPI.quickExportSave();
		if (result.success) setStatus(t("quickExport.saved", "Saved"));
	};
	const copy = async () => {
		const result = await window.electronAPI.quickExportCopy();
		setStatus(
			result.success
				? t("quickExport.copied", "Copied to clipboard")
				: t("quickExport.copyFailed", "Couldn’t copy"),
		);
	};

	const actionClass =
		"flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium text-[var(--launch-text)] transition-colors hover:bg-[var(--launch-hover)]";

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
						aria-label={t("quickExport.close", "Close")}
						title={t("quickExport.close", "Close")}
						className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-80 hover:opacity-100"
						onClick={close}
					>
						<XIcon size={14} />
					</button>
					{status ? (
						<div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[11px] text-white">
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
