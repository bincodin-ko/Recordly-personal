import { createContext, useContext } from "react";

/** A trimmed stretch shown as a bubble on the clip row (Screen Studio "undo trim" bubble). */
export interface TrimBubble {
	id: string;
	/** Timeline clips on either side of the bubble (null at the start/end of the timeline). */
	leftClipId: string | null;
	rightClipId: string | null;
}

/** A detected typing burst, in timeline ms. */
export interface TypingBadge {
	id: string;
	startMs: number;
	endMs: number;
	keyCount: number;
}

export interface ClipActions {
	trimBubbles: TrimBubble[];
	typingBadges: TypingBadge[];
	openClipMenu: (clipId: string, x: number, y: number) => void;
	openTrimRestore: (bubbleId: string) => void;
	openTypingPopover: (badgeId: string, x: number, y: number) => void;
}

const ClipActionsContext = createContext<ClipActions | null>(null);
export const ClipActionsProvider = ClipActionsContext.Provider;
export function useClipActions() {
	return useContext(ClipActionsContext);
}
