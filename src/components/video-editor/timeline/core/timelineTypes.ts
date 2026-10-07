import type { Span } from "dnd-timeline";
import type { ShortcutBinding } from "@/lib/shortcuts";
import type { ZoomMode } from "../../types";

export interface ClipSequenceSpan extends Span {
	/** Insertion index after removing the active clip from the ordered sequence. */
	sequenceIndex?: number;
}

export interface TimelineRegionSpan {
	id: string;
	start: number;
	end: number;
	rowId: string;
}

export interface TimelineRegion {
	id: string;
	startMs: number;
	endMs: number;
}

/** One recorded keyboard shortcut on the shortcuts track (timeline ms). */
export interface TimelineShortcutBlock {
	/** Source time of the keystroke sample; the persisted on/off key. */
	timeMs: number;
	start: number;
	end: number;
	label: string;
	disabled: boolean;
}

export interface TimelineAudioRegion extends TimelineRegion {
	trackIndex?: number;
}

export interface TimelineShortcutBindings {
	addKeyframe: ShortcutBinding;
	addZoom: ShortcutBinding;
	splitClip: ShortcutBinding;
	addAnnotation: ShortcutBinding;
	deleteSelected: ShortcutBinding;
}

export interface TimelineRenderItem {
	id: string;
	rowId: string;
	span: Span;
	sourceSpan?: Span;
	label: string;
	audioPath?: string;
	audioGain?: number;
	audioNormalize?: boolean;
	zoomDepth?: number;
	zoomMode?: ZoomMode;
	speedValue?: number;
	showSourceAudio?: boolean;
	muted?: boolean;
	cursorHidden?: boolean;
	variant: "zoom" | "trim" | "clip" | "annotation" | "speed" | "audio" | "caption";
}

export interface AudioPeaksData {
	durationMs: number;
	peaks: Float32Array;
}
