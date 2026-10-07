import { toast } from "@/components/ui/toast";
import { translate } from "@/contexts/I18nContext";

/**
 * Screen Studio "copy current frame": puts the preview exactly as it looks (wallpaper,
 * zoom, cursor, annotations, captions) on the clipboard as an image.
 */
export async function copyPreviewFrame(frame: HTMLElement | null | undefined) {
	const rect = frame?.getBoundingClientRect();
	if (!rect || rect.width <= 0 || rect.height <= 0) return { success: false };
	const result = await window.electronAPI.copyPreviewFrameToClipboard({
		x: rect.left,
		y: rect.top,
		width: rect.width,
		height: rect.height,
	});
	if (result.success) {
		toast.success(translate("editor.preview.frameCopied", "Frame copied to the clipboard"));
	} else {
		toast.error(translate("editor.preview.frameCopyFailed", "Could not copy the frame"));
	}
	return result;
}
