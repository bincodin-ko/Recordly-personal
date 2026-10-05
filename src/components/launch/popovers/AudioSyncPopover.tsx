import { SpeakerHigh } from "@/components/ui/icons";
import { type ReactElement, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import styles from "../LaunchWindow.module.css";
import { useLaunchPopoverCoordinator } from "./LaunchPopoverCoordinator";
import { DropdownItem, HudPopover } from "./PopoverScaffold";

// Read by electron/ipc/register/recording.ts at record start.
export const SYSTEM_AUDIO_SYNC_OFFSET_SETTING_KEY = "recordly.recording.systemAudioOffsetMs";
// Delay applied to recorded system audio = the playback device's output latency.
// 37 ms was measured on wired speakers/monitor audio; Bluetooth is typically 150-300 ms.
const DEFAULT_OFFSET_MS = 37;
const OPTIONS: Array<{ ms: number; key: string; fallback: string }> = [
	{ ms: 37, key: "default", fallback: "Speakers / monitor (37 ms, default)" },
	{ ms: 150, key: "bt150", fallback: "Bluetooth 150 ms" },
	{ ms: 200, key: "bt200", fallback: "Bluetooth 200 ms" },
	{ ms: 250, key: "bt250", fallback: "Bluetooth 250 ms" },
	{ ms: 300, key: "bt300", fallback: "Bluetooth 300 ms" },
	{ ms: 0, key: "none", fallback: "No compensation (0 ms)" },
];
const POPOVER_ID = "audio-sync";

function loadOffset(): number {
	const value = loadAppSetting<number>(SYSTEM_AUDIO_SYNC_OFFSET_SETTING_KEY);
	return typeof value === "number" ? value : DEFAULT_OFFSET_MS;
}

export function AudioSyncPopover({ trigger }: { trigger: ReactElement }) {
	const t = useScopedT("launch");
	const { isOpen, requestOpen, requestClose } = useLaunchPopoverCoordinator();
	const [offset, setOffset] = useState(loadOffset);

	return (
		<HudPopover
			open={isOpen(POPOVER_ID)}
			onOpenChange={(nextOpen) => (nextOpen ? requestOpen(POPOVER_ID) : requestClose(POPOVER_ID))}
			trigger={trigger}
			align="center"
		>
			<div className={styles.ddLabel}>
				{t("recording.audioSync.title", "System audio sync (your output device)")}
			</div>
			{OPTIONS.map((option) => (
				<DropdownItem
					key={option.key}
					icon={<SpeakerHigh size={16} />}
					selected={offset === option.ms}
					onClick={() => {
						setOffset(option.ms);
						saveAppSetting(SYSTEM_AUDIO_SYNC_OFFSET_SETTING_KEY, option.ms);
						requestClose(POPOVER_ID);
					}}
				>
					{t(`recording.audioSync.${option.key}`, option.fallback)}
				</DropdownItem>
			))}
		</HudPopover>
	);
}
