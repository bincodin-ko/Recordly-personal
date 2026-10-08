import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { rememberVoiceoverScript } from "./audio/voiceoverLabels";
import { useScopedT } from "@/contexts/I18nContext";

type Engine = "qwen" | "supertonic";
type Options = Awaited<ReturnType<typeof window.electronAPI.getVoiceoverOptions>>;

interface VoiceoverDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called with the generated wav; the caller places it on the timeline at the playhead. */
	onGenerated: (audioPath: string) => Promise<void> | void;
}

export function VoiceoverDialog({ open, onOpenChange, onGenerated }: VoiceoverDialogProps) {
	const t = useScopedT("editor");
	const [options, setOptions] = useState<Options | null>(null);
	const [text, setText] = useState("");
	const [engine, setEngine] = useState<Engine>("qwen");
	const [voice, setVoice] = useState("");
	const [busy, setBusy] = useState(false);
	const [stage, setStage] = useState<{ stage: string; detail?: string } | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const startedAt = useRef(0);

	useEffect(() => {
		if (!open || options) return;
		void window.electronAPI.getVoiceoverOptions().then((next) => {
			setOptions(next);
			setEngine(next.defaultEngine);
			setVoice(next.voices[next.defaultEngine][0]);
		});
	}, [open, options]);

	useEffect(() => window.electronAPI.onVoiceoverProgress(setStage), []);

	useEffect(() => {
		if (!busy) return;
		const timer = window.setInterval(
			() => setElapsed(Math.round((performance.now() - startedAt.current) / 1000)),
			500,
		);
		return () => window.clearInterval(timer);
	}, [busy]);

	const handleGenerate = async () => {
		if (!text.trim() || busy) return;
		setBusy(true);
		setStage(null);
		setElapsed(0);
		startedAt.current = performance.now();
		try {
			const result = await window.electronAPI.generateVoiceover({ text, voice, engine });
			if (!result.success || !result.path) {
				toast.error(t("voiceover.failed", "Could not generate the voiceover."), {
					description: result.error?.slice(-300),
				});
				return;
			}
			rememberVoiceoverScript(result.path, text);
			await onGenerated(result.path);
			toast.success(
				t("voiceover.added", "Voiceover added at the playhead ({{seconds}}s).", {
					seconds: (result.durationSec ?? 0).toFixed(1),
				}),
			);
			setText("");
			onOpenChange(false);
		} finally {
			setBusy(false);
		}
	};

	const stageLabel: Record<string, string> = {
		installing: t("voiceover.stage.installing", "Preparing the voice engine (first time only)…"),
		loading: t("voiceover.stage.loading", "Loading the voice model…"),
		generating: t("voiceover.stage.generating", "Generating voice…"),
	};

	// Stages are all the engine reports, so the bar fills per stage and creeps with elapsed time.
	const stageProgress: Record<string, number> = {
		installing: Math.min(30, 8 + elapsed),
		loading: Math.min(55, 35 + elapsed / 2),
		generating: Math.min(95, 60 + elapsed),
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("voiceover.title", "AI voiceover")}</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						{t(
							"voiceover.description",
							"Type a script and it becomes an audio clip at the playhead. Runs on this computer.",
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="mt-2 space-y-4">
					<div className="space-y-2">
						<Label htmlFor="voiceover-text" className="text-foreground">
							{t("voiceover.script", "Script")}
						</Label>
						<textarea
							id="voiceover-text"
							value={text}
							disabled={busy}
							onChange={(event) => setText(event.target.value)}
							placeholder={t("voiceover.placeholder", "Korean or English text…")}
							rows={5}
							spellCheck={false}
							className="w-full resize-none rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-2">
							<Label className="text-foreground">{t("voiceover.engine", "Engine")}</Label>
							<Select
								aria-label={t("voiceover.engine", "Engine")}
								value={engine}
								disabled={busy || !options}
								onValueChange={(value) => {
									const next = value as Engine;
									setEngine(next);
									setVoice(options?.voices[next][0] ?? "");
								}}
							>
								<SelectTrigger className="h-9 w-full text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="qwen">
										{t("voiceover.engineQwen", "Qwen3-TTS · GPU")}
									</SelectItem>
									<SelectItem value="supertonic">
										{t("voiceover.engineSupertonic", "Supertonic 3 · CPU")}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label className="text-foreground">{t("voiceover.voice", "Voice")}</Label>
							<Select
								aria-label={t("voiceover.voice", "Voice")}
								value={voice}
								disabled={busy || !options}
								onValueChange={setVoice}
							>
								<SelectTrigger className="h-9 w-full text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(options?.voices[engine] ?? []).map((name) => (
										<SelectItem key={name} value={name}>
											{name.replace("_", " ")}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					{options && !options.gpu && engine === "qwen" ? (
						<p className="text-xs text-amber-500">
							{t("voiceover.noGpu", "No NVIDIA GPU found. Qwen3-TTS needs one.")}
						</p>
					) : null}

					{busy ? (
						<div className="space-y-1.5" role="status">
							<div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
								<div
									className="h-full rounded-full bg-[#2563EB] transition-[width] duration-700"
									style={{ width: `${stageProgress[stage?.stage ?? "installing"] ?? 10}%` }}
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								{stageLabel[stage?.stage ?? "installing"]} · {elapsed}s
							</p>
							{stage?.detail ? (
								<p className="truncate font-mono text-[10px] text-muted-foreground/70">
									{stage.detail}
								</p>
							) : null}
						</div>
					) : null}

					<div className="flex justify-end gap-2 pt-2">
						<Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
							{t("voiceover.cancel", "Cancel")}
						</Button>
						<Button onClick={handleGenerate} disabled={busy || !text.trim() || !voice}>
							{busy
								? t("voiceover.generating", "Generating…")
								: t("voiceover.generate", "Generate")}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
