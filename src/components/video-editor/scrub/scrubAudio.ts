import { resolveMediaElementSource } from "@/lib/exporter/localMediaSource";
import { grainForRate } from "./scrubMath";

export interface ScrubSource {
	/** Media path or URL to decode. */
	resource: string;
	/** How late this audio starts relative to the recording, in seconds. */
	delaySeconds: number;
	/** Current preview gain (0..1) so a muted microphone stays silent while scrubbing. */
	gain: () => number;
}

// ponytail: whole-file decode; files above this are skipped (silent scrub). Stream/decode windows if it matters.
const MAX_DECODE_BYTES = 300 * 1024 * 1024;
const FADE_SECONDS = 0.008;

/** Audible scrubbing: plays short grains of the recording's audio, forward or reversed. */
export class ScrubAudio {
	private ctx: AudioContext | null = null;
	private sources: ScrubSource[] = [];
	private buffers = new Map<string, Promise<AudioBuffer | null>>();

	setSources(sources: ScrubSource[]) {
		this.sources = sources;
	}

	/** Start decoding; call on pointer down (also unlocks audio). Never throws. */
	warmUp() {
		try {
			this.ctx ??= new AudioContext({ latencyHint: "interactive" });
			void this.ctx.resume().catch(() => undefined);
			for (const source of this.sources) this.load(source.resource);
		} catch {
			/* no audio available: scrubbing stays silent */
		}
	}

	private load(resource: string) {
		let pending = this.buffers.get(resource);
		if (!pending) {
			pending = (async () => {
				try {
					const ctx = this.ctx;
					if (!ctx) return null;
					const { src } = await resolveMediaElementSource(resource);
					const response = await fetch(src);
					const length = Number(response.headers.get("content-length") ?? 0);
					if (!response.ok || length > MAX_DECODE_BYTES) return null;
					return await ctx.decodeAudioData(await response.arrayBuffer());
				} catch {
					return null;
				}
			})();
			this.buffers.set(resource, pending);
		}
		return pending;
	}

	/** Play one grain ending/starting at sourceSeconds for a signed drag rate. */
	async play(sourceSeconds: number, rate: number) {
		const grain = grainForRate(rate);
		const ctx = this.ctx;
		if (!grain || !ctx) return;
		for (const source of this.sources) {
			const gain = source.gain();
			if (gain <= 0) continue;
			const buffer = await this.load(source.resource);
			if (!buffer) continue;
			const sampleRate = buffer.sampleRate;
			const position = (sourceSeconds - source.delaySeconds) * sampleRate;
			const span = Math.round(grain.sourceSpanSeconds * sampleRate);
			const from = Math.round(grain.reverse ? position - span : position);
			if (span < 2 || from + span <= 0 || from >= buffer.length) continue;
			const slice = ctx.createBuffer(buffer.numberOfChannels, span, sampleRate);
			for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
				const input = buffer.getChannelData(channel);
				const output = slice.getChannelData(channel);
				for (let i = 0; i < span; i++) {
					const index = from + (grain.reverse ? span - 1 - i : i);
					output[i] = index >= 0 && index < input.length ? input[index] : 0;
				}
			}
			const node = ctx.createBufferSource();
			node.buffer = slice;
			node.playbackRate.value = grain.playbackRate;
			const envelope = ctx.createGain();
			const now = ctx.currentTime;
			const wall = span / sampleRate / grain.playbackRate;
			envelope.gain.setValueAtTime(0, now);
			envelope.gain.linearRampToValueAtTime(gain, now + FADE_SECONDS);
			envelope.gain.setValueAtTime(gain, Math.max(now + FADE_SECONDS, now + wall - FADE_SECONDS));
			envelope.gain.linearRampToValueAtTime(0, now + wall);
			node.connect(envelope).connect(ctx.destination);
			node.start();
		}
	}

	dispose() {
		this.buffers.clear();
		void this.ctx?.close().catch(() => undefined);
		this.ctx = null;
	}
}
