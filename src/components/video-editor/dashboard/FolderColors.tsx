import { useI18n } from "@/contexts/I18nContext";
import {
	ColorArea,
	ColorField,
	ColorPicker,
	ColorSlider,
	ColorSwatchPicker,
	Input,
	Popover,
} from "@heroui/react";
import { FolderSimple, Plus, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { FOLDER_COLORS } from "./useProjectFolders";

export function FolderColors({
	value,
	onChange,
	custom,
	onCustomChange,
	name,
}: {
	value: string;
	onChange: (color: string) => void;
	custom: string[];
	onCustomChange: (colors: string[]) => void;
	name: string;
}) {
	const { t } = useI18n();
	const colors = [...new Set([...FOLDER_COLORS, ...custom])];
	return (
		<ColorPicker value={value} onChange={(color) => onChange(color.toString("hex"))}>
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("editor.dashboard.folderColors.change", "Change color for {{name}}", { name })}
				className="size-8 min-w-8 rounded-md"
			>
				<FolderSimple weight="fill" className="size-[18px]" style={{ color: value }} />
			</Button>
			<ColorPicker.Popover>
				<Popover.Dialog aria-label={t("editor.dashboard.folderColors.dialog", "Folder color")} className="flex w-60 flex-col gap-3 p-3">
					<ColorSwatchPicker aria-label={t("editor.dashboard.folderColors.swatches", "Folder colors")}>
						{colors.map((color) => (
							<ColorSwatchPicker.Item key={color} color={color}>
								<ColorSwatchPicker.Swatch />
								<ColorSwatchPicker.Indicator />
							</ColorSwatchPicker.Item>
						))}
					</ColorSwatchPicker>
					<ColorArea
						colorSpace="hsb"
						xChannel="saturation"
						yChannel="brightness"
						className="h-32"
					>
						<ColorArea.Thumb />
					</ColorArea>
					<ColorSlider colorSpace="hsb" channel="hue">
						<ColorSlider.Track>
							<ColorSlider.Thumb />
						</ColorSlider.Track>
					</ColorSlider>
					<div className="flex items-center gap-2">
						<ColorField aria-label={t("editor.dashboard.folderColors.hex", "Hex color")} className="min-w-0 flex-1">
							<Input aria-label={t("editor.dashboard.folderColors.hex", "Hex color")} className="h-8 text-xs" />
						</ColorField>
						<Button
							variant="ghost"
							size="icon"
							aria-label={
								custom.includes(value)
									? t("editor.dashboard.folderColors.removeCustom", "Remove custom color")
									: t("editor.dashboard.folderColors.saveCustom", "Save custom color")
							}
							disabled={FOLDER_COLORS.includes(value)}
							className="size-8 min-w-8"
							onClick={() =>
								onCustomChange(
									custom.includes(value)
										? custom.filter((color) => color !== value)
										: [...custom, value],
								)
							}
						>
							{custom.includes(value) ? (
								<X className="size-4" />
							) : (
								<Plus className="size-4" />
							)}
						</Button>
					</div>
				</Popover.Dialog>
			</ColorPicker.Popover>
		</ColorPicker>
	);
}
