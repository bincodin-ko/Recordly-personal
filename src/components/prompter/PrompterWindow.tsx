import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";

// Speaker notes / teleprompter. The window is excluded from screen capture
// (setContentProtection), so it is visible only to the person recording.
const STORAGE_KEY = "recordly.prompter";

type PrompterState = { text: string; speed: number; fontSize: number; opacity: number };
const DEFAULTS: PrompterState = { text: "", speed: 30, fontSize: 28, opacity: 0.9 };

function loadState(): PrompterState {
	try {
		return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
	} catch {
		return DEFAULTS;
	}
}

export function PrompterWindow() {
	const t = useScopedT("launch");
	const [state, setState] = useState(loadState);
	const [playing, setPlaying] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch {
			// storage unavailable: settings just won't persist
		}
	}, [state]);

	// Scroll at `speed` px/s while playing.
	useEffect(() => {
		if (!playing) return;
		let last = performance.now();
		let frame = requestAnimationFrame(function step(now) {
			const el = scrollRef.current;
			if (el) el.scrollTop += ((now - last) / 1000) * state.speed;
			last = now;
			frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	}, [playing, state.speed]);

	const set = (patch: Partial<PrompterState>) => setState((prev) => ({ ...prev, ...patch }));

	return (
		<div
			className="flex h-screen w-screen flex-col text-white"
			style={{ background: `rgba(17,17,24,${state.opacity})` }}
		>
			<div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2 text-xs">
				<button
					type="button"
					className="rounded-md bg-blue-600 px-3 py-1 font-medium"
					onClick={() => setPlaying((value) => !value)}
				>
					{playing ? t("prompter.pause", "Pause") : t("prompter.start", "Start")}
				</button>
				<button
					type="button"
					className="rounded-md bg-white/10 px-3 py-1"
					onClick={() => {
						setPlaying(false);
						if (scrollRef.current) scrollRef.current.scrollTop = 0;
					}}
				>
					{t("prompter.toTop", "Back to top")}
				</button>
				<label className="flex items-center gap-1">
					{t("prompter.speed", "Speed")}
					<input type="range" min={5} max={150} value={state.speed} onChange={(e) => set({ speed: Number(e.target.value) })} />
				</label>
				<label className="flex items-center gap-1">
					{t("prompter.fontSize", "Text size")}
					<input type="range" min={14} max={64} value={state.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
				</label>
				<label className="flex items-center gap-1">
					{t("prompter.opacity", "Opacity")}
					<input type="range" min={30} max={100} value={Math.round(state.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
				</label>
				<span className="ml-auto text-white/50">{t("prompter.hiddenNote", "Not recorded")}</span>
			</div>
			{playing ? (
				<div
					ref={scrollRef}
					className="flex-1 overflow-y-hidden whitespace-pre-wrap px-6 py-[40vh] leading-relaxed"
					style={{ fontSize: state.fontSize }}
				>
					{state.text}
				</div>
			) : (
				<textarea
					className="flex-1 resize-none bg-transparent px-6 py-4 leading-relaxed outline-none"
					style={{ fontSize: state.fontSize }}
					placeholder={t("prompter.placeholder", "Paste or type your script here, then press Start.")}
					value={state.text}
					onChange={(e) => set({ text: e.target.value })}
				/>
			)}
		</div>
	);
}
