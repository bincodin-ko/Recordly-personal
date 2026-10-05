import { useI18n } from "@/contexts/I18nContext";
import { Button, Card, Link } from "@heroui/react";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { dashboardAnnouncements, type AnnouncementConfig } from "./announcementConfig";

export function DashboardAnnouncements({
	config = dashboardAnnouncements,
}: {
	config?: AnnouncementConfig;
}) {
	const { enabled, banners } = config;
	const [index, setIndex] = useState(0);
	const { t } = useI18n();
	if (!enabled || !banners.length) return null;
	const active = index % banners.length;
	const banner = banners[active];
	const image = (
		<img
			src={
				/^(https?:|data:|\/)/.test(banner.src)
					? banner.src
					: `${import.meta.env.BASE_URL}${banner.src}`
			}
			alt={banner.alt}
			className="block aspect-[6/1] w-full object-cover"
		/>
	);
	const href = banner.href && /^https?:\/\//.test(banner.href) ? banner.href : undefined;
	return (
		<Card
			aria-label={t("editor.dashboard.announcements.label", "Announcements")}
			aria-roledescription="carousel"
			className="relative mx-7 mt-7 shrink-0 overflow-hidden rounded-2xl p-0 shadow-none lg:mx-10"
		>
			<div aria-live="polite" aria-atomic="true">
				{href ? (
					<Link
						href={href}
						onAuxClick={(event) => event.preventDefault()}
						className="block w-full"
						onClick={(event) => {
							event.preventDefault();
							void window.electronAPI
								.openExternalUrl(href)
								.catch(() => toast.error(t("editor.dashboard.announcements.openFailed", "Could not open announcement")));
						}}
					>
						{image}
					</Link>
				) : (
					image
				)}
			</div>
			{banners.length > 1 && (
				<div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
					<Button
						isIconOnly
						size="sm"
						variant="secondary"
						aria-label={t("editor.dashboard.announcements.previous", "Previous announcement")}
						onPress={() => setIndex((active + banners.length - 1) % banners.length)}
					>
						<ArrowLeft className="size-4" />
					</Button>
					<div
						className="flex gap-2 rounded-full bg-black/30 px-2 py-0.5"
						aria-label={t("editor.dashboard.announcements.choose", "Choose announcement")}
					>
						{banners.map((banner, slide) => (
							<Button
								key={`${slide}:${banner.src}`}
								isIconOnly
								variant="ghost"
								aria-label={t("editor.dashboard.announcements.slide", "Announcement {{n}}", { n: slide + 1 })}
								aria-pressed={slide === active}
								onPress={() => setIndex(slide)}
								className="!size-6 !min-h-6 !min-w-6 rounded-full p-0"
							>
								<span
									className={`size-1.5 rounded-full ${slide === active ? "bg-white" : "bg-white/40"}`}
								/>
							</Button>
						))}
					</div>
					<Button
						isIconOnly
						size="sm"
						variant="secondary"
						aria-label={t("editor.dashboard.announcements.next", "Next announcement")}
						onPress={() => setIndex((active + 1) % banners.length)}
					>
						<ArrowRight className="size-4" />
					</Button>
				</div>
			)}
		</Card>
	);
}
