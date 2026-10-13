import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MagnifyingGlass } from "@/components/ui/icons";

export interface EditorCommand {
	id: string;
	label: string;
	/** Extra words the search also matches (English aliases, synonyms). */
	keywords?: string;
	/** Display-only key hint, e.g. "Ctrl+C". */
	shortcut?: string;
	disabled?: boolean;
	run: () => void;
}

export function filterCommands(commands: EditorCommand[], query: string): EditorCommand[] {
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return commands;
	return commands
		.filter((command) => {
			const haystack = `${command.label} ${command.keywords ?? ""}`.toLowerCase();
			return tokens.every((token) => haystack.includes(token));
		})
		.sort(
			(a, b) =>
				Number(b.label.toLowerCase().startsWith(tokens[0])) -
				Number(a.label.toLowerCase().startsWith(tokens[0])),
		);
}

type Props = {
	open: boolean;
	onClose: () => void;
	commands: EditorCommand[];
	placeholder: string;
	emptyLabel: string;
	hint: string;
	ariaLabel: string;
};

/** Screen Studio-style command menu (Ctrl/Cmd+K): type a feature name, Enter runs it. */
export function CommandMenu({
	open,
	onClose,
	commands,
	placeholder,
	emptyLabel,
	hint,
	ariaLabel,
}: Props) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const previousFocus = useRef<HTMLElement | null>(null);
	const results = useMemo(() => filterCommands(commands, query), [commands, query]);

	useEffect(() => {
		if (!open) return;
		previousFocus.current = document.activeElement as HTMLElement | null;
		setQuery("");
		setActive(0);
		inputRef.current?.focus();
		return () => previousFocus.current?.focus?.();
	}, [open]);

	useEffect(() => setActive(0), [query]);
	useEffect(() => {
		listRef.current
			?.querySelector<HTMLElement>(`[data-index="${active}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [active]);

	if (!open) return null;

	const runCommand = (command: EditorCommand | undefined) => {
		if (!command || command.disabled) return;
		onClose();
		window.setTimeout(command.run, 0);
	};
	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onClose();
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive((index) => Math.min(results.length - 1, index + 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((index) => Math.max(0, index - 1));
		} else if (event.key === "Enter") {
			event.preventDefault();
			runCommand(results[active]);
		}
	};

	return createPortal(
		<div
			className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-[14vh]"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={ariaLabel}
				data-testid="command-menu"
				onKeyDown={onKeyDown}
				className="flex max-h-[min(460px,70vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-separator bg-background text-foreground shadow-2xl"
			>
				<div className="flex items-center gap-2.5 border-b border-separator px-4">
					<MagnifyingGlass className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={placeholder}
						aria-label={placeholder}
						spellCheck={false}
						style={{ outline: "none" }} // the dialog is the focus context; the global ring would clip at its rounded edge
						className="h-12 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground"
					/>
				</div>
				<div ref={listRef} role="listbox" className="max-h-[300px] min-h-0 flex-1 overflow-y-auto p-1.5">
					{results.length === 0 ? (
						<div className="px-3 py-8 text-center text-sm text-muted-foreground">
							{emptyLabel}
						</div>
					) : (
						results.map((command, index) => (
							<button
								key={command.id}
								type="button"
								role="option"
								aria-selected={index === active}
								data-index={index}
								data-command-id={command.id}
								disabled={command.disabled}
								onMouseMove={() => setActive(index)}
								onClick={() => runCommand(command)}
								className={`flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm disabled:opacity-40 ${
									index === active ? "bg-foreground/10" : ""
								}`}
							>
								<span className="min-w-0 truncate">{command.label}</span>
								{command.shortcut ? (
									<kbd className="shrink-0 rounded border border-separator px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
										{command.shortcut}
									</kbd>
								) : null}
							</button>
						))
					)}
				</div>
				<div className="border-t border-separator px-4 py-2 text-[11px] text-muted-foreground">
					{hint}
				</div>
			</div>
		</div>,
		document.body,
	);
}
