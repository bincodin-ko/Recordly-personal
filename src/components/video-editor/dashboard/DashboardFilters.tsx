import { useI18n } from "@/contexts/I18nContext";
import type { DashboardProps } from "./types";
import { Dropdown } from "@heroui/react";
import { CaretDown, Trash } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";

import type { DashboardModel } from "./useDashboardModel";

export function DashboardFilters({
	isRaw,
	period,
	setPeriod,
	selecting,
	setSelecting,
	selected,
	setSelected,
	sort,
	setSort,
	visible,
	busy,
	deleteEntries,
	hideSelection = false,
}: Pick<
	DashboardModel & DashboardProps,
	| "isRaw"
	| "period"
	| "setPeriod"
	| "selecting"
	| "setSelecting"
	| "selected"
	| "setSelected"
	| "sort"
	| "setSort"
	| "visible"
	| "busy"
	| "deleteEntries"
> & { hideSelection?: boolean }) {
	const { t } = useI18n();
	return (
		<>
			<div className="flex items-center gap-3 px-7 pb-7 lg:px-10">
				<div className="flex gap-2" aria-label={t("editor.dashboard.filters.time", "Time filters")}>
					{[
						["all", t("editor.dashboard.filters.all", "All")],
						["week", t("editor.dashboard.filters.week", "Last 7 days")],
						["month", t("editor.dashboard.filters.month", "Last 30 days")],
					].map(([id, label]) => (
						<Button
							key={id}
							variant="ghost"
							size="sm"
							aria-pressed={period === id}
							onClick={() => setPeriod(id)}
							className={`h-7 rounded-lg px-3 text-xs ${period === id ? "bg-default/60 text-foreground" : "text-muted-foreground"}`}
						>
							{label}
						</Button>
					))}
					{!hideSelection && (
						<Button
							variant="ghost"
							size="icon"
							className="size-7 min-w-7 text-danger"
							aria-label={
								isRaw
									? t("editor.dashboard.filters.selectRaw", "Select raw files to remove")
									: t("editor.dashboard.filters.selectProjects", "Select projects to delete")
							}
							aria-pressed={selecting}
							onClick={() => {
								setSelecting(!selecting);
								setSelected([]);
							}}
						>
							<Trash weight="fill" className="size-4" />
						</Button>
					)}
				</div>
				<div className="ml-auto">
					<Dropdown>
						<Button
							variant="ghost"
							size="sm"
							aria-label={isRaw ? t("editor.dashboard.filters.sortRaw", "Sort raw files") : t("editor.dashboard.filters.sortProjects", "Sort projects")}
							className="h-7 gap-2 text-xs text-muted-foreground"
						>
							{sort === "recent"
								? isRaw
									? t("editor.dashboard.filters.lastCreated", "Last created")
									: t("editor.dashboard.filters.lastEdited", "Last edited")
								: sort === "created"
									? t("editor.dashboard.filters.lastCreated", "Last created")
									: t("editor.dashboard.filters.name", "Name")}
							<CaretDown className="size-3" />
						</Button>
						<Dropdown.Popover>
							<Dropdown.Menu aria-label={isRaw ? t("editor.dashboard.filters.sortRaw", "Sort raw files") : t("editor.dashboard.filters.sortProjects", "Sort projects")}>
								{!isRaw && (
									<Dropdown.Item id="recent" onAction={() => setSort("recent")}>
										{t("editor.dashboard.filters.lastEdited", "Last edited")}
									</Dropdown.Item>
								)}
								<Dropdown.Item id="created" onAction={() => setSort("created")}>
									{t("editor.dashboard.filters.lastCreated", "Last created")}
								</Dropdown.Item>
								<Dropdown.Item id="name" onAction={() => setSort("name")}>
									{t("editor.dashboard.filters.name", "Name")}
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</div>
			</div>
			{selecting && (
				<div className="flex items-center gap-3 px-7 pb-5 text-xs lg:px-10">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setSelected(visible.map((e) => e.path))}
					>
						{t("editor.dashboard.filters.selectAll", "Select all")}
					</Button>
					<span>{t("editor.dashboard.filters.selectedCount", "{{count}} selected", { count: selected.length })}</span>
					<Button
						variant="destructive"
						size="sm"
						disabled={!selected.length || busy}
						onClick={() => void deleteEntries(selected)}
					>
						{isRaw ? t("editor.dashboard.filters.remove", "Remove") : t("editor.dashboard.filters.delete", "Delete")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setSelecting(false);
							setSelected([]);
						}}
					>
						{t("editor.dashboard.filters.cancel", "Cancel")}
					</Button>
				</div>
			)}
		</>
	);
}
