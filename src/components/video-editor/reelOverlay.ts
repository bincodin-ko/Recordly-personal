/** Reel mode overlay choice. Preview only: nothing under src/lib/exporter may import this file. */
export type ReelOverlayKind = "off" | "instagram" | "tiktok";
export const REEL_OVERLAY_KINDS: ReelOverlayKind[] = ["off", "instagram", "tiktok"];
export const REEL_OVERLAY_STORAGE_KEY = "recordly.reelOverlay";

export interface ReelZone {
	/** Percent of the 9:16 frame. */
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Areas the app's own UI covers, so the user keeps text and faces out of them. */
export function getReelOverlayZones(
	kind: ReelOverlayKind,
): { rightButtons: ReelZone; bottomCaption: ReelZone; top: ReelZone } | null {
	if (kind === "off") return null;
	const tiktok = kind === "tiktok";
	return {
		top: { left: 0, top: 0, width: 100, height: tiktok ? 9 : 8 },
		rightButtons: { left: 86, top: tiktok ? 40 : 46, width: 12, height: tiktok ? 46 : 40 },
		bottomCaption: { left: 0, top: tiktok ? 80 : 76, width: 82, height: tiktok ? 20 : 24 },
	};
}

export function loadReelOverlayKind(): ReelOverlayKind {
	try {
		const value = globalThis.localStorage?.getItem(REEL_OVERLAY_STORAGE_KEY);
		return REEL_OVERLAY_KINDS.includes(value as ReelOverlayKind)
			? (value as ReelOverlayKind)
			: "off";
	} catch {
		return "off";
	}
}

export function saveReelOverlayKind(kind: ReelOverlayKind) {
	try {
		globalThis.localStorage?.setItem(REEL_OVERLAY_STORAGE_KEY, kind);
	} catch {
		// storage unavailable: the choice just lasts for this session
	}
}
