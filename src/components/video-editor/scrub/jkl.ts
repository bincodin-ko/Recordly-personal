export type JklKey = "j" | "k" | "l";
export interface JklState {
	dir: -1 | 0 | 1;
	speed: 1 | 2 | 4;
}
export const JKL_IDLE: JklState = { dir: 0, speed: 1 };

/** J reverse, K stop, L forward; repeating the same direction key doubles speed (1x, 2x, 4x). */
export function jklReduce(state: JklState, key: JklKey): JklState {
	if (key === "k") return JKL_IDLE;
	const dir = key === "l" ? 1 : -1;
	if (state.dir !== dir) return { dir, speed: 1 };
	return { dir, speed: state.speed === 1 ? 2 : 4 };
}

/** Signed multiple of normal speed. */
export function jklRate(state: JklState): number {
	return state.dir * state.speed;
}

/** Plain forward 1x is the normal player; everything else is stepped by the JKL loop. */
export function jklUsesNativePlayback(state: JklState): boolean {
	return state.dir === 1 && state.speed === 1;
}
