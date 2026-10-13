import { createContext, type MouseEvent, useContext } from "react";

interface HudInteractionContextType {
	onMouseEnter: () => void;
	onMouseLeave: (event: MouseEvent<HTMLDivElement>) => void;
}

export const HudInteractionContext = createContext<HudInteractionContextType | null>(null);

const NO_HUD_INTERACTION: HudInteractionContextType = {
	onMouseEnter: () => undefined,
	onMouseLeave: () => undefined,
};

export function useHudInteraction() {
	// The standalone source-selector window renders SourceSelector without the HUD provider
	// (nothing to keep hover-interactive there), so fall back to no-ops instead of crashing blank.
	return useContext(HudInteractionContext) ?? NO_HUD_INTERACTION;
}
