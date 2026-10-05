import { useI18n } from "@/contexts/I18nContext";
import { SettingsSections, SettingsCategory } from "../SettingsSections";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { supportsHudCaptureProtection } from "@/lib/hudCaptureProtection";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
export const DashboardSettingsContext = createContext<ReactNode>(null);
export function DashboardSettings({ onImportFile }: { onImportFile: () => Promise<void> }) {
	const { t } = useI18n();
	const settingsContent = useContext(DashboardSettingsContext);
	const [directory, setDirectory] = useState("");
	const [recordings, setRecordings] = useState("");
	const [hideHud, setHideHud] = useState(true);
	const [captureSupported, setCaptureSupported] = useState(false);
	const [busy, setBusy] = useState(false);
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(String(error));
		} finally {
			setBusy(false);
		}
	};
	useEffect(() => {
		let active = true;
		void Promise.all([
			window.electronAPI.getRecordingsDirectory(),
			window.electronAPI.getHudOverlayCaptureProtection(),
			window.electronAPI.getPlatform(),
		])
			.then(([directory, protection, platform]) => {
				if (!active) return;
				if (directory.success) setRecordings(directory.path);
				if (protection.success) setHideHud(protection.enabled);
				setCaptureSupported(supportsHudCaptureProtection(platform));
			})
			.catch((error) => toast.error(String(error)));
		return () => {
			active = false;
		};
	}, []);
	return (
		<section aria-label={t("editor.dashboard.settings.label", "Dashboard settings")} className="dashboard-settings max-w-2xl py-10">
			<h1 className="mb-8 text-lg font-semibold">{t("editor.dashboard.sidebar.settings", "Settings")}</h1>
			<SettingsSections categories={["general", "motion", "recording", "files", "advanced"]}>
				<SettingsCategory category={["general", "motion", "advanced"]}>
					{settingsContent}
				</SettingsCategory>
				<SettingsCategory category="files">
					<SettingsRow title={t("editor.dashboard.settings.openTitle", "Open video or project")}>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => void run(onImportFile)}
						>
							{t("editor.dashboard.settings.openFile", "Open file")}
						</Button>
					</SettingsRow>
				</SettingsCategory>
				<SettingsCategory category="recording">
					<SettingsRow
						title={t("editor.dashboard.settings.recordingsFolder", "Recordings folder")}
						description={
							<span className="block truncate" title={recordings}>
								{recordings}
							</span>
						}
					>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									const result =
										await window.electronAPI.chooseRecordingsDirectory();
									if (result.canceled) return;
									if (!result.success || !result.path)
										throw Error(t("editor.dashboard.settings.changeFailed", "Could not change recordings folder"));
									setRecordings(result.path);
								})
							}
						>
							{t("editor.dashboard.settings.changeFolder", "Change folder")}
						</Button>
					</SettingsRow>
					{captureSupported && (
						<SettingsRow
							title={t("editor.dashboard.settings.hideHud", "Hide HUD from recordings")}
							description={t("editor.dashboard.settings.hideHudHint", "Only while recording. The idle HUD stays visible in captures.")}
						>
							<Switch
								aria-label={t("editor.dashboard.settings.hideHud", "Hide HUD from recordings")}
								checked={hideHud}
								disabled={busy}
								onCheckedChange={(enabled) =>
									void run(async () => {
										const result =
											await window.electronAPI.setHudOverlayCaptureProtection(
												enabled,
											);
										if (!result.success)
											throw Error(t("editor.dashboard.settings.protectionFailed", "Could not update capture protection"));
										setHideHud(result.enabled);
									})
								}
							/>
						</SettingsRow>
					)}
				</SettingsCategory>
				<SettingsCategory category="advanced">
					{import.meta.env.DEV && (
						<SettingsRow title="Preview update UI">
							<Button
								variant="secondary"
								size="sm"
								disabled={busy}
								onClick={() =>
									void run(async () => {
										await window.electronAPI.previewUpdateToast();
									})
								}
							>
								Preview
							</Button>
						</SettingsRow>
					)}
				</SettingsCategory>
				<SettingsCategory category="files">
					<SettingsRow
						title={t("editor.dashboard.settings.projectsFolder", "Projects folder")}
						description={directory || t("editor.dashboard.settings.autosave", "Named projects save automatically.")}
					>
						<Button
							variant="secondary"
							size="sm"
							onClick={async () => {
								try {
									const result = await window.electronAPI.getProjectsDirectory();
									if (!result.success || !result.path)
										throw Error(t("editor.dashboard.settings.openFailed", "Could not open projects folder"));
									setDirectory(result.path);
									await window.electronAPI.revealInFolder(result.path);
								} catch (e) {
									toast.error(String(e));
								}
							}}
						>
							{t("editor.dashboard.settings.showFolder", "Show folder")}
						</Button>
					</SettingsRow>
					<p className="text-xs text-muted-foreground">
						{t("editor.dashboard.settings.autosaveHint", "Named projects save automatically. Previews refresh when you return to Projects.")}
					</p>
				</SettingsCategory>
			</SettingsSections>
		</section>
	);
}
