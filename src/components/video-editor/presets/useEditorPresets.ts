import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo } from "react";
import { toast } from "@/components/ui/toast";
import {
	type EditorPreset,
	type EditorPresetSnapshot,
	parseEditorPresetFile,
	PRESET_FILE_EXTENSION,
	saveEditorPresets,
	serializeEditorPresetFile,
	serializeEditorPresetSnapshot,
} from "../editorPreferences";

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseEditorPresetsParams {
	t: Translator;
	currentSnapshot: EditorPresetSnapshot;
	applySnapshot: (snapshot: EditorPresetSnapshot) => void;
	editorPresets: EditorPreset[];
	setEditorPresets: Dispatch<SetStateAction<EditorPreset[]>>;
	activePresetId: string | null;
	setActivePresetId: Dispatch<SetStateAction<string | null>>;
	presetPopoverOpen: boolean;
	presetNameDraft: string;
	setPresetNameDraft: Dispatch<SetStateAction<string>>;
}

export function useEditorPresets({
	t,
	currentSnapshot,
	applySnapshot,
	editorPresets,
	setEditorPresets,
	activePresetId,
	setActivePresetId,
	presetPopoverOpen,
	presetNameDraft,
	setPresetNameDraft,
}: UseEditorPresetsParams) {
	const currentSignature = useMemo(
		() => serializeEditorPresetSnapshot(currentSnapshot),
		[currentSnapshot],
	);
	const currentEditorPreset = useMemo(
		() => editorPresets.find((preset) => preset.id === activePresetId) ?? null,
		[activePresetId, editorPresets],
	);

	useEffect(() => {
		if (
			currentEditorPreset &&
			serializeEditorPresetSnapshot(currentEditorPreset.snapshot) === currentSignature
		) {
			return;
		}

		const matchingPreset =
			editorPresets.find(
				(preset) => serializeEditorPresetSnapshot(preset.snapshot) === currentSignature,
			) ?? null;
		const nextActiveId = matchingPreset?.id ?? null;
		if (nextActiveId !== activePresetId) setActivePresetId(nextActiveId);
	}, [activePresetId, currentEditorPreset, currentSignature, editorPresets, setActivePresetId]);

	useEffect(() => {
		if (!presetPopoverOpen) setPresetNameDraft("");
	}, [presetPopoverOpen, setPresetNameDraft]);

	const handleApplyEditorPreset = useCallback(
		(presetId: string) => {
			const preset = editorPresets.find((item) => item.id === presetId);
			if (!preset) return;
			setActivePresetId(preset.id);
			applySnapshot(preset.snapshot);
			toast.success(
				t("editor.presets.toasts.applied", 'Applied preset "{{name}}"', {
					name: preset.name,
				}),
			);
		},
		[applySnapshot, editorPresets, setActivePresetId, t],
	);

	const handleSaveEditorPreset = useCallback(
		(name: string) => {
			const normalizedName = name.trim().replace(/\s+/g, " ");
			if (!normalizedName) {
				toast.error(t("editor.presets.errors.nameRequired", "Enter a preset name."));
				return false;
			}
			if (
				editorPresets.some(
					(preset) =>
						preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
				)
			) {
				toast.error(
					t(
						"editor.presets.errors.duplicateName",
						"A preset with that name already exists.",
					),
				);
				return false;
			}

			const timestamp = new Date().toISOString();
			const nextPreset: EditorPreset = {
				id: crypto.randomUUID(),
				name: normalizedName,
				createdAt: timestamp,
				updatedAt: timestamp,
				snapshot: currentSnapshot,
			};
			const nextPresets = [nextPreset, ...editorPresets];
			if (!saveEditorPresets(nextPresets)) {
				toast.error(
					t(
						"editor.presets.errors.saveFailed",
						"Could not save that preset. Check your browser storage settings and try again.",
					),
				);
				return false;
			}
			setEditorPresets(nextPresets);
			setActivePresetId(nextPreset.id);
			toast.success(
				t("editor.presets.toasts.saved", 'Saved preset "{{name}}"', {
					name: normalizedName,
				}),
			);
			return true;
		},
		[currentSnapshot, editorPresets, setActivePresetId, setEditorPresets, t],
	);

	const handleDeleteEditorPreset = useCallback(
		(presetId: string) => {
			const preset = editorPresets.find((item) => item.id === presetId);
			if (!preset) return;
			const nextPresets = editorPresets.filter((item) => item.id !== presetId);
			if (!saveEditorPresets(nextPresets)) {
				toast.error(
					t(
						"editor.presets.errors.deleteFailed",
						"Could not delete that preset. Check your browser storage settings and try again.",
					),
				);
				return;
			}
			setEditorPresets(nextPresets);
			if (preset.id === activePresetId) setActivePresetId(null);
			toast.success(
				t("editor.presets.toasts.deleted", 'Deleted preset "{{name}}"', {
					name: preset.name,
				}),
			);
		},
		[activePresetId, editorPresets, setActivePresetId, setEditorPresets, t],
	);

	const handleSavePresetSubmit = useCallback(() => {
		if (handleSaveEditorPreset(presetNameDraft)) setPresetNameDraft("");
	}, [handleSaveEditorPreset, presetNameDraft, setPresetNameDraft]);

	const handleExportEditorPresetFile = useCallback(() => {
		const name = currentEditorPreset?.name ?? (presetNameDraft.trim() || "preset");
		try {
			const blob = new Blob([serializeEditorPresetFile({ name, snapshot: currentSnapshot })], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}${PRESET_FILE_EXTENSION}`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
			toast.success(t("editor.presets.toasts.exported", 'Exported preset "{{name}}" to a file', { name }));
		} catch {
			toast.error(t("editor.presets.errors.exportFailed", "Could not save the preset file."));
		}
	}, [currentEditorPreset, currentSnapshot, presetNameDraft, t]);

	const handleImportEditorPresetFile = useCallback(
		async (file: File) => {
			const parsed = parseEditorPresetFile(await file.text().catch(() => ""));
			if (!parsed) {
				toast.error(
					t(
						"editor.presets.errors.importInvalid",
						"Could not read the preset file. Check that it is a valid .recordly-preset file.",
					),
				);
				return;
			}
			const taken = new Set(editorPresets.map((preset) => preset.name.toLocaleLowerCase()));
			let name = parsed.name;
			for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) name = `${parsed.name} (${n})`;
			const timestamp = new Date().toISOString();
			const imported: EditorPreset = {
				id: crypto.randomUUID(),
				name,
				createdAt: timestamp,
				updatedAt: timestamp,
				snapshot: parsed.snapshot,
			};
			const nextPresets = [imported, ...editorPresets];
			if (!saveEditorPresets(nextPresets)) {
				toast.error(t("editor.presets.errors.saveFailed", "Could not save that preset. Check your browser storage settings and try again."));
				return;
			}
			setEditorPresets(nextPresets);
			setActivePresetId(imported.id);
			applySnapshot(imported.snapshot);
			toast.success(t("editor.presets.toasts.imported", 'Imported preset "{{name}}"', { name }));
		},
		[applySnapshot, editorPresets, setActivePresetId, setEditorPresets, t],
	);

	return {
		handleExportEditorPresetFile,
		handleImportEditorPresetFile,
		currentEditorPreset,
		handleApplyEditorPreset,
		handleDeleteEditorPreset,
		handleSavePresetSubmit,
	};
}
