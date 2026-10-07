import { Label } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { UploadSimple as Upload } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { useScopedT } from "@/contexts/I18nContext";
import {
	applyLutToPixel,
	COLOR_LOOKS,
	type ColorLookSettings,
	cubeToStoredLut,
	getLookLut,
} from "@/lib/colorGrading";
import { cn } from "@/lib/utils";
import { SliderControl } from "./SliderControl";

const THUMB_W = 64;
const THUMB_H = 40;

/** Current frame of the matching preview <video> (screen or camera), or a neutral sample. */
function grabFrame(source: "screen" | "camera"): ImageData {
	const canvas = document.createElement("canvas");
	canvas.width = THUMB_W;
	canvas.height = THUMB_H;
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
	const video = document.querySelector<HTMLVideoElement>(`video[data-look-source="${source}"]`);
	try {
		if (
			video &&
			video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
			video.videoWidth > 0
		) {
			const scale = Math.max(THUMB_W / video.videoWidth, THUMB_H / video.videoHeight);
			const w = video.videoWidth * scale;
			const h = video.videoHeight * scale;
			ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
			return ctx.getImageData(0, 0, THUMB_W, THUMB_H);
		}
	} catch {
		// tainted or not decodable yet: fall through to the sample
	}
	const gradient = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H);
	gradient.addColorStop(0, "#2b4c7e");
	gradient.addColorStop(0.5, "#d9a07a");
	gradient.addColorStop(1, "#f2e6c9");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, THUMB_W, THUMB_H);
	return ctx.getImageData(0, 0, THUMB_W, THUMB_H);
}

function LookThumb({ frame, look }: { frame: ImageData | null; look: ColorLookSettings }) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas || !frame) return;
		const lut = getLookLut({ ...look, intensity: 1 });
		const out = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
		if (lut) {
			const d = out.data;
			for (let i = 0; i < d.length; i += 4) {
				const [r, g, b] = applyLutToPixel(lut, d[i], d[i + 1], d[i + 2]);
				d[i] = r;
				d[i + 1] = g;
				d[i + 2] = b;
			}
		}
		canvas.getContext("2d")?.putImageData(out, 0, 0);
	}, [frame, look]);
	return (
		<canvas
			ref={ref}
			width={THUMB_W}
			height={THUMB_H}
			className="block aspect-[8/5] w-full rounded-md bg-foreground/10"
		/>
	);
}

export function ColorLookControl({
	source,
	value,
	onChange,
}: {
	source: "screen" | "camera";
	value: ColorLookSettings;
	onChange: (next: ColorLookSettings) => void;
}) {
	const t = useScopedT("settings");
	const [frame, setFrame] = useState<ImageData | null>(null);
	const fileRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		setFrame(grabFrame(source));
		const timer = window.setInterval(() => setFrame(grabFrame(source)), 2000);
		return () => window.clearInterval(timer);
	}, [source]);

	const options: { id: string; look: ColorLookSettings; label: string }[] = [
		{ id: "none", look: { ...value, look: "none" }, label: t("looks.none", "None") },
		...COLOR_LOOKS.map((l) => ({
			id: l.id,
			look: { ...value, look: l.id },
			label: t(`looks.${l.id}`, l.id),
		})),
	];
	if (value.lut) {
		options.push({ id: "custom", look: { ...value, look: "custom" }, label: value.lut.name });
	}

	const importLut = async (file: File) => {
		try {
			const lut = cubeToStoredLut(file.name.replace(/\.cube$/i, ""), await file.text());
			onChange({ look: "custom", intensity: 1, lut });
		} catch (error) {
			toast.error(t("looks.importFailed", "Could not read this LUT file"), {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	};

	return (
		<div className="flex flex-col gap-3 py-2">
			<Label className="text-xs text-muted-foreground">{t("looks.title", "Look")}</Label>
			<div
				className="grid grid-cols-4 gap-2"
				role="radiogroup"
				aria-label={t("looks.title", "Look")}
			>
				{options.map((option) => {
					const selected = value.look === option.id;
					return (
						<button
							key={option.id}
							type="button"
							role="radio"
							aria-checked={selected}
							title={option.label}
							onClick={() => onChange(option.look)}
							className="flex min-w-0 flex-col items-center gap-1 rounded-lg p-0.5 text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
						>
							<span
								className={cn(
									"block w-full rounded-lg p-0.5 ring-1 ring-foreground/10",
									selected && "ring-2 ring-accent",
								)}
							>
								<LookThumb frame={frame} look={option.look} />
							</span>
							<span
								className={cn(
									"w-full truncate text-center",
									selected && "text-foreground",
								)}
							>
								{option.label}
							</span>
						</button>
					);
				})}
			</div>
			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				className="flex h-8 items-center justify-center gap-2 rounded-lg border border-foreground/10 text-xs text-muted-foreground hover:bg-foreground/5"
			>
				<Upload className="h-3 w-3" />
				{t("looks.importLut", "Import LUT (.cube)")}
			</button>
			<input
				ref={fileRef}
				type="file"
				accept=".cube"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void importLut(file);
				}}
			/>
			{value.look !== "none" && (
				<SliderControl
					label={t("looks.intensity", "Intensity")}
					value={value.intensity}
					min={0}
					max={1}
					step={0.01}
					onChange={(intensity) => onChange({ ...value, intensity })}
					formatValue={(v) => `${Math.round(v * 100)}%`}
				/>
			)}
		</div>
	);
}
