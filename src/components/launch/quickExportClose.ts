// Read by QuickExportWidget; default ON (only an explicit false turns it off).
export const OPEN_EDITOR_ON_WIDGET_CLOSE_KEY = "recordly.recording.openEditorOnWidgetClose";

/** Closing the widget with [x]: open the editor (like Edit) unless the setting is off. */
export function shouldOpenEditorOnWidgetClose(setting: boolean | null | undefined) {
	return setting !== false;
}
