import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

interface LaunchPopoverCoordinatorValue {
	openId: string | null;
	requestOpen: (id: string) => void;
	requestClose: (id: string) => void;
	isOpen: (id: string) => boolean;
}

const LaunchPopoverCoordinatorContext = createContext<LaunchPopoverCoordinatorValue | null>(null);

export function LaunchPopoverCoordinatorProvider({ children }: { children: ReactNode }) {
	const [openId, setOpenId] = useState<string | null>(null);
	// Press on the open popover's own trigger: closed on pointerdown, so the toggle
	// that react-aria fires on release must not reopen it.
	const closedByTriggerAtRef = useRef(0);

	const requestOpen = useCallback((id: string) => {
		if (performance.now() - closedByTriggerAtRef.current < 500) return;
		setOpenId(id);
	}, []);

	const requestClose = useCallback((id: string) => {
		setOpenId((currentId) => (currentId === id ? null : currentId));
	}, []);

	const isOpen = useCallback((id: string) => openId === id, [openId]);

	useEffect(() => {
		const handleBlur = () => setOpenId(null);
		// HUD popovers are non-modal so a click on another bar button (e.g. Record) works
		// right away instead of only closing the popover; close them on outside presses here.
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (target?.closest?.(".popover")) return;
			if (target?.closest?.('[aria-expanded="true"]'))
				closedByTriggerAtRef.current = performance.now();
			setOpenId(null);
		};
		window.addEventListener("blur", handleBlur);
		window.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			window.removeEventListener("blur", handleBlur);
			window.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, []);

	const value = useMemo(
		() => ({
			openId,
			requestOpen,
			requestClose,
			isOpen,
		}),
		[isOpen, openId, requestClose, requestOpen],
	);

	return (
		<LaunchPopoverCoordinatorContext.Provider value={value}>
			{children}
		</LaunchPopoverCoordinatorContext.Provider>
	);
}

export function useLaunchPopoverCoordinator() {
	const context = useContext(LaunchPopoverCoordinatorContext);
	if (!context) {
		throw new Error(
			"useLaunchPopoverCoordinator must be used within LaunchPopoverCoordinatorProvider",
		);
	}
	return context;
}
