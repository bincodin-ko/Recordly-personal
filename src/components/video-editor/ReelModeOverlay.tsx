import {
	BookmarkSimple,
	ChatCircle,
	DotsThree,
	Heart,
	MagnifyingGlass,
	MusicNotes,
	Plus,
	ShareNetwork,
	UserCircle,
} from "@/components/ui/icons";
import { getReelOverlayZones, type ReelOverlayKind } from "./reelOverlay";

const pct = (n: number) => `${n}%`;
const box = (z: { left: number; top: number; width: number; height: number }) => ({
	left: pct(z.left),
	top: pct(z.top),
	width: pct(z.width),
	height: pct(z.height),
});
const iconClass = "size-6 drop-shadow";

/** Schematic of an app's UI zones (generic shapes, no brand marks), drawn over the preview only. */
export function ReelModeOverlay({ kind }: { kind: Exclude<ReelOverlayKind, "off"> }) {
	const zones = getReelOverlayZones(kind);
	if (!zones) return null;
	const tiktok = kind === "tiktok";
	return (
		<div
			className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit] text-white"
			data-testid="reel-mode-overlay"
			data-kind={kind}
		>
			<div
				className="absolute flex items-center justify-between bg-gradient-to-b from-black/40 to-transparent px-[5%] text-[13px] font-semibold"
				style={box({ ...zones.top, height: zones.top.height + 4 })}
			>
				{tiktok ? (
					<>
						<span className="w-5" />
						<span className="flex gap-4">
							<span className="opacity-70">Following</span>
							<span className="border-b-2 border-white pb-0.5">For You</span>
						</span>
						<MagnifyingGlass className="size-5" />
					</>
				) : (
					<>
						<span>Reels</span>
						<span className="size-5 rounded-md border-2 border-white" />
					</>
				)}
			</div>
			<div
				className="absolute flex flex-col items-center justify-end gap-4 pb-[2%]"
				style={box(zones.rightButtons)}
			>
				{tiktok ? (
					<span className="relative mb-1">
						<UserCircle weight="fill" className="size-9 drop-shadow" />
						<Plus
							weight="bold"
							className="absolute -bottom-1.5 left-1/2 size-4 -translate-x-1/2 rounded-full bg-[#ef4444] p-0.5"
						/>
					</span>
				) : null}
				<Heart weight="fill" className={iconClass} />
				<ChatCircle weight="fill" className={iconClass} />
				{tiktok ? <BookmarkSimple weight="fill" className={iconClass} /> : null}
				<ShareNetwork weight="fill" className={iconClass} />
				{tiktok ? (
					<span className="size-7 rounded-full border-[6px] border-neutral-800 bg-neutral-300" />
				) : (
					<>
						<DotsThree weight="bold" className={iconClass} />
						<span className="size-6 rounded-md border-2 border-white bg-white/30" />
					</>
				)}
			</div>
			<div
				className="absolute inset-x-0 bg-gradient-to-t from-black/55 to-transparent"
				style={{ top: pct(zones.bottomCaption.top), height: pct(zones.bottomCaption.height) }}
			/>
			<div
				className="absolute flex flex-col justify-end gap-1.5 pb-[4%] pl-[4%] text-[12px] drop-shadow"
				style={box(zones.bottomCaption)}
			>
				<div className="flex items-center gap-2 font-semibold">
					{tiktok ? null : <UserCircle weight="fill" className="size-6" />}
					<span>{tiktok ? "@your_account" : "your_account"}</span>
					{tiktok ? null : (
						<span className="rounded border border-white/70 px-1.5 text-[0.85em]">Follow</span>
					)}
				</div>
				<div className="h-2 w-3/4 rounded-full bg-white/70" />
				<div className="flex items-center gap-1.5 opacity-90">
					<MusicNotes className="size-3.5" />
					<div className="h-1.5 w-1/2 rounded-full bg-white/60" />
				</div>
			</div>
		</div>
	);
}
