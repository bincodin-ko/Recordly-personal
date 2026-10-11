/** Recording started -> play, stopped -> pause; with auto-flow off the state is left alone. */
export function nextPrompterPlaying(playing: boolean, recording: boolean, autoFlow: boolean) {
	return autoFlow ? recording : playing;
}
