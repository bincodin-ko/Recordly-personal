import { ToggleButton } from "@heroui/react";
import { AppWindowIcon, CaretUpIcon, Crop, MonitorIcon } from "@/components/ui/icons";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import {
	type DesktopSource,
	isScreenSource,
	isWindowSource,
	mapRawSource,
} from "./popovers/launchPopoverTypes";
import "./launchTheme.css";
import "./SourceSelector.css";
import { useHudInteraction } from "./contexts/HudInteractionContext";
import { MarqueeText } from "./MarqueeText";

interface SourceSelectorProps {
	/** List of available screen sources */
	screenSources?: DesktopSource[];
	/** List of available window sources */
	windowSources?: DesktopSource[];
	/** Currently selected source name */
	selectedSource?: string;
	/** Loading state */
	loading?: boolean;
	/** Callback when a source is selected */
	onSourceSelect?: (source: DesktopSource) => void;
	/** Callback to fetch sources */
	onFetchSources?: () => Promise<void>;
	/** Whether the popover is open */
	open?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Optional custom trigger element */
	children?: React.ReactNode;
}

type CaptureArea = { x: number; y: number; width: number; height: number };

/** Area recording: pick a rectangle on the selected screen (recorded full, editor opens cropped). */
function AreaPickerRow({
	screenSources,
	selectedSource,
	onSourceSelect,
}: {
	screenSources: DesktopSource[];
	selectedSource: string;
	onSourceSelect: (source: DesktopSource) => void;
}) {
	const t = useScopedT("launch");
	const [area, setArea] = useState<CaptureArea | null>(null);
	useEffect(() => {
		void window.electronAPI?.getCaptureArea?.().then((value) => setArea(value ?? null));
	}, []);
	const onClick = async () => {
		if (area) {
			setArea(await window.electronAPI.clearCaptureArea());
			return;
		}
		const screen = screenSources.find((s) => s.name === selectedSource) ?? screenSources[0];
		if (screen && screen.name !== selectedSource) await onSourceSelect(screen);
		setArea((await window.electronAPI.selectCaptureArea()) ?? null);
	};
	return (
		<Button
			variant="ghost"
			className="source-selector-item w-full min-h-[40px] px-3 justify-start gap-3 text-left"
			onClick={() => void onClick()}
		>
			<Crop className="w-5 h-5 source-selector-muted" />
			<span className="text-sm source-selector-text">
				{area
					? t("recording.area.clear", "Area set ({{w}}% × {{h}}%) · clear", {
							w: Math.round(area.width * 100),
							h: Math.round(area.height * 100),
						})
					: t("recording.area.select", "Record part of the screen (area)…")}
			</span>
		</Button>
	);
}

/** Android phones connected over USB (adb). Recorded with scrcpy in the main process. */
function AndroidDevicesSection({
	selectedSource,
	onSourceSelect,
}: {
	selectedSource: string;
	onSourceSelect: (source: DesktopSource) => void;
}) {
	const t = useScopedT("launch");
	const [devices, setDevices] = useState<Array<{ serial: string; model: string }>>([]);
	useEffect(() => {
		void window.electronAPI?.getAndroidDevices?.().then((list) => setDevices(list ?? []));
	}, []);
	return (
		<div className="space-y-1">
			<div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] source-selector-label">
				{t("recording.android.title", "Android devices (USB)")}
			</div>
			{devices.length === 0 ? (
				<div className="px-3 pb-2 text-xs source-selector-subtle">
					{t("recording.android.none", "No phone found. Turn on USB debugging and connect it.")}
				</div>
			) : (
				devices.map((device) => {
					const source: DesktopSource = {
						id: `android:${device.serial}`,
						name: device.model,
						thumbnail: null,
						display_id: "",
						appIcon: null,
					};
					const isSelected = selectedSource === source.name;
					return (
						<Button
							key={device.serial}
							variant="ghost"
							className={cn(
								"source-selector-item w-full min-h-[40px] px-3 justify-start gap-3 text-left",
								isSelected && "source-selector-item-selected",
							)}
							onClick={() => onSourceSelect(source)}
						>
							<MonitorIcon className="w-5 h-5 source-selector-muted" />
							<span className="text-sm source-selector-text">{device.model}</span>
						</Button>
					);
				})
			)}
		</div>
	);
}

/**
 * SourceSelectorContent - The actual list of sources
 */
export const SourceSelectorContent = ({
	screenSources = [],
	windowSources = [],
	selectedSource = "Screen",
	loading = false,
	onSourceSelect = () => undefined,
}: Pick<
	SourceSelectorProps,
	"screenSources" | "windowSources" | "selectedSource" | "loading" | "onSourceSelect"
>) => {
	const t = useScopedT("launch");
	const renderSourceItem = (source: DesktopSource, index: number) => {
		const isSelected = selectedSource === source.name;
		return (
			<ToggleButton
				variant="ghost"
				isSelected={isSelected}
				key={`${source.id}-${index}`}
				className={cn(
					"source-selector-item group min-h-[46px] w-full px-3 py-2.5 text-left flex items-center justify-start gap-3",
					isSelected && "source-selector-item-selected",
				)}
				onClick={() => onSourceSelect(source)}
			>
				<div className="relative flex-shrink-0">
					{source.thumbnail ? (
						<img
							src={source.thumbnail}
							alt=""
							className="w-12 h-8 rounded-[8px] object-cover bg-black/50"
							onError={(e) => {
								(e.target as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<div className="source-selector-thumb-fallback w-12 h-8 rounded-[8px] flex items-center justify-center">
							{source.sourceType === "window" ? (
								<AppWindowIcon className="w-5 h-5 source-selector-muted" />
							) : (
								<MonitorIcon className="w-5 h-5 source-selector-muted" />
							)}
						</div>
					)}
				</div>

				<div className="flex-1 min-w-0 flex flex-col items-start text-left">
					<div className="text-sm font-medium source-selector-text w-full">
						<MarqueeText text={source.windowTitle || source.name} />
					</div>
					<div className="text-xs source-selector-subtle truncate w-full text-left">
						{source.sourceType === "screen"
							? t("recording.screen")
							: t("recording.window")}
					</div>
				</div>
			</ToggleButton>
		);
	};

	const hasAnySources = screenSources.length > 0 || windowSources.length > 0;

	if (loading && !hasAnySources) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="animate-spin rounded-full h-5 w-5 border-b-2 source-selector-accent-border" />
			</div>
		);
	}

	return (
		<div className="max-h-[320px] overflow-y-auto overflow-x-hidden p-2 source-selector-scroll">
			{hasAnySources ? (
				<>
					{screenSources.length > 0 ? (
						<div className="space-y-1">
							<div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] source-selector-label flex items-center gap-2">
								{t("recording.screens")}
								<span
									className={cn(
										"normal-case tracking-normal text-[10px] source-selector-muted transition-opacity duration-150",
										loading ? "opacity-100" : "opacity-0",
									)}
								>
									{t("common.loading", "Refreshing...")}
								</span>
							</div>
							<div className="space-y-0.5">
								{screenSources.map((source, index) =>
									renderSourceItem(source, index),
								)}
								<AreaPickerRow
									screenSources={screenSources}
									selectedSource={selectedSource}
									onSourceSelect={onSourceSelect}
								/>
							</div>
						</div>
					) : null}
					{windowSources.length > 0 ? (
						<div className="space-y-1">
							<div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] source-selector-label">
								{t("recording.windows")}
							</div>
							<div className="space-y-0.5">
								{windowSources.map((source, index) =>
									renderSourceItem(source, index),
								)}
							</div>
						</div>
					) : null}
				</>
			) : (
				<div className="text-center py-8 text-sm source-selector-muted">
					{t("recording.noSourcesFound")}
				</div>
			)}
			<AndroidDevicesSection selectedSource={selectedSource} onSourceSelect={onSourceSelect} />
		</div>
	);
};

/**
 * SourceSelector - A rich source selection component with thumbnails
 * Uses the shared HeroUI popover for positioning and accessibility
 */
export const SourceSelector = React.memo(function SourceSelector({
	screenSources: propsScreenSources,
	windowSources: propsWindowSources,
	selectedSource: propsSelectedSource,
	loading: propsLoading,
	onSourceSelect: propsOnSourceSelect,
	onFetchSources: propsOnFetchSources,
	open: propsOpen,
	onOpenChange: propsOnOpenChange,
	children,
}: SourceSelectorProps) {
	// Internal state for standalone/uncontrolled use
	const [internalOpen, setInternalOpen] = useState(false);
	const [internalSources, setInternalSources] = useState<DesktopSource[]>([]);
	const [internalLoading, setInternalLoading] = useState(false);
	const [internalSelectedSource, setInternalSelectedSource] = useState("Screen");

	// Determine if we should use internal or external state/logic
	const isAutonomous = propsOpen === undefined;
	const open = propsOpen ?? internalOpen;
	const onOpenChange = propsOnOpenChange ?? setInternalOpen;
	const loading = propsLoading ?? internalLoading;
	const selectedSource = propsSelectedSource ?? internalSelectedSource;

	// Default fetching logic
	const defaultFetchSources = useCallback(async () => {
		if (!window.electronAPI) return;
		setInternalLoading(true);
		try {
			const rawSources = await window.electronAPI.getSources({
				types: ["screen", "window"],
				thumbnailSize: { width: 160, height: 90 },
				fetchWindowIcons: true,
			});
			setInternalSources(rawSources.map((s) => mapRawSource(s as DesktopSource)));
		} catch (error) {
			console.error("Failed to fetch sources:", error);
		} finally {
			setInternalLoading(false);
		}
	}, []);

	const onFetchSources = propsOnFetchSources ?? defaultFetchSources;

	// Default selection logic
	const onSourceSelect = useCallback(
		async (source: DesktopSource) => {
			if (propsOnSourceSelect) {
				propsOnSourceSelect(source);
				return;
			}
			if (!window.electronAPI) return;
			try {
				const result = await window.electronAPI.selectSource(source);
				if (result) {
					setInternalSelectedSource(source.name);
					await window.electronAPI.showSourceHighlight?.(source);
				}
			} catch (error) {
				console.error("Failed to select source:", error);
			}
		},
		[propsOnSourceSelect],
	);

	// Split sources for internal use
	const internalScreenSources = useMemo(
		() => internalSources.filter(isScreenSource),
		[internalSources],
	);
	const internalWindowSources = useMemo(
		() => internalSources.filter(isWindowSource),
		[internalSources],
	);

	const screenSources = propsScreenSources ?? internalScreenSources;
	const windowSources = propsWindowSources ?? internalWindowSources;

	const hasPrefetchedRef = useRef(false);
	const fetchInFlightRef = useRef(false);
	const lastFetchedAtRef = useRef(0);

	const fetchSourcesOnce = useCallback(
		async (allowRecentSkip: boolean) => {
			if (fetchInFlightRef.current) {
				return;
			}
			if (allowRecentSkip && Date.now() - lastFetchedAtRef.current < 750) {
				return;
			}
			fetchInFlightRef.current = true;
			try {
				await onFetchSources();
				lastFetchedAtRef.current = Date.now();
			} finally {
				fetchInFlightRef.current = false;
			}
		},
		[onFetchSources],
	);

	const prefetchSources = React.useCallback(() => {
		if (hasPrefetchedRef.current) {
			return;
		}
		hasPrefetchedRef.current = true;
		void fetchSourcesOnce(false);
	}, [fetchSourcesOnce]);

	// Fetch sources when popover opens
	useEffect(() => {
		if (open) {
			void fetchSourcesOnce(true);
		}
	}, [open, fetchSourcesOnce]);

	// In autonomous mode, we might want to start open
	useEffect(() => {
		if (isAutonomous) {
			setInternalOpen(true);
		}
	}, [isAutonomous]);

	const trigger = children ? (
		React.isValidElement(children) ? (
			React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
				onPointerEnter: prefetchSources,
				onFocusCapture: prefetchSources,
			})
		) : (
			children
		)
	) : (
		<Button
			variant="ghost"
			size="lg"
			onPointerEnter={prefetchSources}
			onFocusCapture={prefetchSources}
			className={cn(
				"group gap-2 px-3 min-w-0 max-w-[180px] [ -webkit-app-region:no-drag ] shrink-0",
			)}
			title={selectedSource}
		>
			<MonitorIcon size={16} className="shrink-0" />
			<div className="flex-1 min-w-0">
				<MarqueeText text={selectedSource} />
			</div>
			<CaretUpIcon
				size={10}
				className={cn(
					"text-[#6b6b78] ml-0.5 shrink-0 transition-transform duration-200",
					open ? "" : "rotate-180",
				)}
			/>
		</Button>
	);

	const { onMouseEnter } = useHudInteraction();

	return (
		<Popover open={open} onOpenChange={onOpenChange} modal={false}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				className="launch-theme w-80 p-0 source-selector-popover"
				unstyled
				align="start"
				sideOffset={8}
				side="top"
				alignOffset={-8}
				avoidCollisions={true}
				collisionPadding={10}
				usePortal={false}
				onMouseEnter={onMouseEnter}
			>
				<SourceSelectorContent
					screenSources={screenSources}
					windowSources={windowSources}
					selectedSource={selectedSource}
					loading={loading}
					onSourceSelect={onSourceSelect}
				/>
			</PopoverContent>
		</Popover>
	);
});

SourceSelector.displayName = "SourceSelector";
