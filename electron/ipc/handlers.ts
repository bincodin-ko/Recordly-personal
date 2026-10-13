import { BrowserWindow } from "electron";
import { registerAnnouncementHandlers } from "./register/announcements";
import { registerAssetHandlers } from "./register/assets";
import { registerCaptionHandlers } from "./register/captions";
import { registerBirefnetHandlers } from "./birefnet/birefnet";
import { registerCameraAiHandlers } from "./cameraAi";
import { registerVoiceoverHandlers } from "./tts/voiceover";
import { registerUpscaleHandlers } from "./upscale/upscale";
import { registerEditorExtrasHandlers } from "./register/editorExtras";
import { registerMicEnhanceHandlers } from "./register/micEnhance";
import { registerCloudShareHandlers } from "./register/cloudShare";
import { registerExportHandlers } from "./register/export";
import { registerPermissionHandlers } from "./register/permissions";
import { registerProjectHandlers } from "./register/project";
import { registerRecordingHandlers } from "./register/recording";
import { registerSettingsHandlers } from "./register/settings";
import { registerSourceHandlers } from "./register/sources";
import {
	selectedSource,
	setNativeScreenRecordingActive,
	setWindowsCapturePaused,
	setWindowsCaptureProcess,
	setWindowsCaptureStopRequested,
	setWindowsCaptureTargetPath,
	setWindowsMicAudioPath,
	setWindowsNativeCaptureActive,
	setWindowsOrphanedMicAudioPath,
	setWindowsPendingVideoPath,
	setWindowsSystemAudioPath,
	windowsCaptureProcess,
} from "./state";

export { cleanupAllExportStreams, hasActiveExportStreams } from "./export/exportStream";
export { cleanupNativeVideoExportSessions, hasActiveNativeExports } from "./export/native-video";
export { isCursorCaptureActive as isRecordingActive } from "./state";

/** Returns the currently selected source ID for setDisplayMediaRequestHandler */
export function getSelectedSourceId(): string | null {
	return (selectedSource?.id as string | null) ?? null;
}

export function killWindowsCaptureProcess() {
	if (windowsCaptureProcess) {
		try {
			windowsCaptureProcess.kill();
		} catch {
			/* ignore */
		}
		setWindowsCaptureProcess(null);
		setWindowsCaptureTargetPath(null);
		setWindowsNativeCaptureActive(false);
		setNativeScreenRecordingActive(false);
		setWindowsCaptureStopRequested(false);
		setWindowsCapturePaused(false);
		setWindowsSystemAudioPath(null);
		setWindowsMicAudioPath(null);
		setWindowsOrphanedMicAudioPath(null);
		setWindowsPendingVideoPath(null);
	}
}

export function registerIpcHandlers(
	createEditorWindow: () => void,
	createSourceSelectorWindow: () => BrowserWindow,
	_getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
	onRecordingStateChange?: (recording: boolean, sourceName: string) => void,
) {
	registerSourceHandlers({
		createEditorWindow,
		createSourceSelectorWindow,
		getSourceSelectorWindow,
	});
	registerRecordingHandlers(onRecordingStateChange);
	registerPermissionHandlers();
	registerAnnouncementHandlers();
	registerAssetHandlers();
	registerExportHandlers();
	registerCaptionHandlers();
	registerEditorExtrasHandlers();
	registerMicEnhanceHandlers();
	registerCameraAiHandlers();
	registerBirefnetHandlers();
	registerVoiceoverHandlers();
	registerUpscaleHandlers();
	registerCloudShareHandlers();
	registerProjectHandlers();
	registerSettingsHandlers();
}
