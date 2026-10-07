import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { ASPECT_RATIOS, getAspectRatioLabel } from "@/utils/aspectRatioUtils";
import type { useI18n } from "@/contexts/I18nContext";
import { copyPreviewFrame } from "../copyFrame";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useClipRegionCommands } from "../hooks/useClipRegionCommands";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useEditorUiState } from "../state/useEditorUiState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { EditorEffectSection } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { CommandMenu, type EditorCommand } from "./CommandMenu";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	isMac: boolean;
	timelineRef: RefObject<TimelineEditorHandle | null>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	timeline: ReturnType<typeof useTimelineState>;
	appearance: ReturnType<typeof useAppearanceState>;
	ui: ReturnType<typeof useEditorUiState>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	clipCommands: ReturnType<typeof useClipRegionCommands>;
	handleUndo: () => void;
	handleRedo: () => void;
	handleSave: () => void;
	handleOpenProjects: () => void;
	handleOpenExport: () => void;
};

const SECTION_COMMANDS: { id: EditorEffectSection; key: string; fallback: string }[] = [
	{ id: "scene", key: "scene", fallback: "Scene" },
	{ id: "zoom", key: "zoom", fallback: "Zoom" },
	{ id: "cursor", key: "cursor", fallback: "Cursor" },
	{ id: "webcam", key: "webcam", fallback: "Webcam" },
	{ id: "captions", key: "captions", fallback: "Captions" },
	{ id: "settings", key: "settings", fallback: "Settings" },
];

/** Ctrl/Cmd+K command menu and the Ctrl/Cmd+C "copy current frame" shortcut. */
export function EditorCommandMenu(props: Props) {
	const { t, isMac, ui, timeline, appearance, playback, clipCommands } = props;
	const [open, setOpen] = useState(false);
	const copyFrame = useCallback(
		() => void copyPreviewFrame(props.videoPlaybackRef.current?.containerRef.current),
		[props.videoPlaybackRef],
	);
	const mod = isMac ? "⌘" : "Ctrl";

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey)
				return;
			if (!(isMac ? event.metaKey : event.ctrlKey)) return;
			const key = event.key.toLowerCase();
			if (key === "k") {
				event.preventDefault();
				setOpen((value) => !value);
				return;
			}
			if (key !== "c" || open) return;
			const target = event.target as HTMLElement | null;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable ||
				window.getSelection()?.toString()
			)
				return;
			event.preventDefault();
			copyFrame();
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [isMac, open, copyFrame]);

	const commands = useMemo<EditorCommand[]>(() => {
		const timelineHandle = () => props.timelineRef.current;
		const list: EditorCommand[] = [
			{
				id: "addZoom",
				label: t("editor.commandMenu.addZoom", "Add zoom"),
				keywords: "zoom add magnify",
				run: () => timelineHandle()?.addZoom(),
			},
			{
				id: "autoZoom",
				label: t("editor.commandMenu.autoZoom", "Create zooms automatically"),
				keywords: "auto zoom suggest",
				run: () => timelineHandle()?.suggestZooms(),
			},
			{
				id: "splitClip",
				label: t("editor.commandMenu.splitClip", "Split clip"),
				keywords: "split trim cut clip",
				run: () => timelineHandle()?.splitClip(),
			},
			{
				id: "addAnnotation",
				label: t("editor.commandMenu.addAnnotation", "Add annotation"),
				keywords: "annotation text arrow blur highlight image",
				run: () => timelineHandle()?.addAnnotation(),
			},
			{
				id: "addAudio",
				label: t("editor.commandMenu.addAudio", "Add audio"),
				keywords: "audio music sound",
				run: () => void timelineHandle()?.addAudio(),
			},
			{
				id: "separateAudio",
				label: t("editor.commandMenu.separateAudio", "Separate audio from clip"),
				keywords: "separate audio extract detach",
				disabled: !timeline.selectedClipId && timeline.clipRegions.length !== 1,
				run: () =>
					void clipCommands.handleClipSeparateAudio(
						timeline.selectedClipId ?? timeline.clipRegions[0]?.id,
					),
			},
			{
				id: "copyFrame",
				label: t("editor.commandMenu.copyFrame", "Copy current frame as image"),
				keywords: "copy frame image screenshot clipboard",
				shortcut: `${mod}+C`,
				run: copyFrame,
			},
			{
				id: "playPause",
				label: t("editor.commandMenu.playPause", "Play / Pause"),
				keywords: "play pause",
				shortcut: "Space",
				run: playback.togglePlayPause,
			},
			{
				id: "skipBack",
				label: t("editor.commandMenu.skipBack", "Jump to previous point"),
				keywords: "back previous rewind",
				run: playback.handlePreviewSkipBack,
			},
			{
				id: "skipForward",
				label: t("editor.commandMenu.skipForward", "Jump to next point"),
				keywords: "forward next",
				run: playback.handlePreviewSkipForward,
			},
			{
				id: "undo",
				label: t("editor.commandMenu.undo", "Undo"),
				keywords: "undo",
				shortcut: `${mod}+Z`,
				run: props.handleUndo,
			},
			{
				id: "redo",
				label: t("editor.commandMenu.redo", "Redo"),
				keywords: "redo",
				shortcut: isMac ? "⌘+⇧+Z" : "Ctrl+Y",
				run: props.handleRedo,
			},
			{
				id: "save",
				label: t("editor.commandMenu.save", "Save project"),
				keywords: "save project",
				run: props.handleSave,
			},
			{
				id: "export",
				label: t("editor.commandMenu.export", "Export"),
				keywords: "export publish share render save video gif",
				run: props.handleOpenExport,
			},
			{
				id: "toggleCaptions",
				label: t("editor.commandMenu.toggleCaptions", "Toggle captions"),
				keywords: "captions subtitles toggle",
				run: () =>
					timeline.setAutoCaptionSettings((current) => ({
						...current,
						enabled: !current.enabled,
					})),
			},
			{
				id: "toggleCursor",
				label: t("editor.commandMenu.toggleCursor", "Toggle cursor"),
				keywords: "cursor mouse pointer toggle hide show",
				run: () => appearance.setShowCursor(!appearance.showCursor),
			},
			{
				id: "crop",
				label: t("editor.commandMenu.crop", "Crop"),
				keywords: "crop",
				run: ui.handleOpenCropEditor,
			},
			{
				id: "openProjects",
				label: t("editor.commandMenu.openProjects", "Open projects"),
				keywords: "projects open library",
				run: props.handleOpenProjects,
			},
		];
		for (const ratio of ASPECT_RATIOS) {
			list.push({
				id: `aspect-${ratio}`,
				label: t("editor.commandMenu.aspectRatio", "Aspect ratio: {{ratio}}", {
					ratio: getAspectRatioLabel(ratio),
				}),
				keywords: `aspect ratio ${ratio}`,
				run: () => ui.setAspectRatio(ratio),
			});
		}
		for (const section of SECTION_COMMANDS) {
			list.push({
				id: `go-${section.id}`,
				label: t("editor.commandMenu.goTo", "Open {{section}}", {
					section: t(`settings.sections.${section.key}`, section.fallback),
				}),
				keywords: `open go ${section.fallback}`,
				run: () => ui.setActiveEffectSection(section.id),
			});
		}
		return list;
	}, [t, mod, isMac, props, timeline, appearance, ui, playback, clipCommands, copyFrame]);

	return (
		<CommandMenu
			open={open}
			onClose={() => setOpen(false)}
			commands={commands}
			ariaLabel={t("editor.commandMenu.title", "Command menu")}
			placeholder={t("editor.commandMenu.placeholder", "Search commands...")}
			emptyLabel={t("editor.commandMenu.empty", "No matching commands")}
			hint={t("editor.commandMenu.hint", "Up/Down to move, Enter to run, Esc to close")}
		/>
	);
}
