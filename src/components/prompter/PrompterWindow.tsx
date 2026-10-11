import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { nextPrompterPlaying } from "./prompterAutoFlow";

// Speaker notes / teleprompter. The window is excluded from screen capture
// (setContentProtection), so it is visible only to the person recording.
const STORAGE_KEY = "recordly.prompter";

type PrompterState = { text: string; speed: number; fontSize: number; opacity: number; autoFlow: boolean };
const DEFAULTS: PrompterState = { text: "", speed: 20, fontSize: 28, opacity: 0.9, autoFlow: true };

function loadState(): PrompterState {
	try {
		const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
		return { ...saved, speed: Math.min(80, Math.max(2, Number(saved.speed) || DEFAULTS.speed)) };
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

	// Recording starts (after the countdown) / stops: main broadcasts recording-state-changed.
	const autoFlowRef = useRef(state.autoFlow);
	autoFlowRef.current = state.autoFlow;
	useEffect(
		() =>
			window.electronAPI?.onRecordingStateChanged?.(({ recording }) =>
				setPlaying((current) => nextPrompterPlaying(current, recording, autoFlowRef.current)),
			),
		[],
	);

	// Scroll at `speed` px/s while playing. scrollTop only takes whole pixels, so the
	// position is accumulated as a float (slow speeds otherwise rounded to 0 per frame).
	useEffect(() => {
		if (!playing) return;
		let last = performance.now();
		let position = scrollRef.current?.scrollTop ?? 0;
		let frame = requestAnimationFrame(function step(now) {
			const el = scrollRef.current;
			position += ((now - last) / 1000) * state.speed;
			if (el) el.scrollTop = Math.round(position);
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
					<input type="range" min={2} max={80} value={state.speed} onChange={(e) => set({ speed: Number(e.target.value) })} />
				</label>
				<label className="flex items-center gap-1">
					{t("prompter.fontSize", "Text size")}
					<input type="range" min={14} max={64} value={state.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
				</label>
				<label className="flex items-center gap-1">
					{t("prompter.opacity", "Opacity")}
					<input type="range" min={30} max={100} value={Math.round(state.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
				</label>
				<label className="flex items-center gap-1">
					<input type="checkbox" checked={state.autoFlow} onChange={(e) => set({ autoFlow: e.target.checked })} />
					{t("prompter.autoFlow", "Scroll automatically when recording starts")}
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
