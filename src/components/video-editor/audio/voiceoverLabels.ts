// Remembers the script behind each generated voiceover file (session only).
// Saved projects only keep the file name, so those fall back to the plain label.
const scripts = new Map<string, string>();
const baseName = (path: string) => path.split(/[\/]/).pop() ?? path;

export function rememberVoiceoverScript(audioPath: string, script: string) {
	scripts.set(baseName(audioPath), script.trim().replace(/\s+/g, " "));
}

/** Returns the voiceover label ("title" + script start) or null for ordinary audio. */
export function getVoiceoverLabel(audioPath: string): { script: string | null } | null {
	const name = baseName(audioPath);
	if (!/^voiceover-\d+\.wav$/i.test(name)) return null;
	return { script: scripts.get(name) ?? null };
}
