export type QuitBusy = "recording" | "exporting" | null;

export function getQuitBusy(state: { recording: boolean; exporting: boolean }): QuitBusy {
	if (state.recording) return "recording";
	if (state.exporting) return "exporting";
	return null;
}

/** Dialog text for a quit while busy; button 0 = quit, 1 = cancel. */
export function quitDialogOptions(busy: Exclude<QuitBusy, null>) {
	return {
		type: "warning" as const,
		buttons: ["끄기", "취소"],
		defaultId: 1,
		cancelId: 1,
		title: "Recordly",
		message:
			busy === "recording"
				? "녹화 중입니다. 정말 끌까요?"
				: "내보내는 중입니다. 정말 끌까요?",
	};
}

/** True when quitting may go on: nothing running, already confirmed, or the user chose 끄기. */
export function shouldAllowQuit(
	busy: QuitBusy,
	confirmed: boolean,
	ask: (busy: Exclude<QuitBusy, null>) => number,
): boolean {
	if (!busy || confirmed) return true;
	return ask(busy) === 0;
}
