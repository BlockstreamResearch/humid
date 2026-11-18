import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/theme/utils";
import { UiScrollArea } from "@/ui/UiScrollArea";

type PageHeaderProps = {
	back?: LinkProps & { label: string };
	title: ReactNode;
	aside?: ReactNode;
};

export function PageHeader({ back, title, aside }: PageHeaderProps) {
	return (
		<header
			className={cn(
				"border-border/60 flex h-12 shrink-0 items-center gap-2 border-b",
				back ? "pr-5 pl-3.5" : "px-5",
			)}
		>
			{back && (
				<Link
					{...back}
					aria-label={back.label}
					className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md p-1.5 transition-colors"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
			)}
			<div className="flex min-w-0 flex-1 items-center gap-2">
				{typeof title === "string" ? (
					<h1 className="truncate text-base font-semibold">{title}</h1>
				) : (
					title
				)}
			</div>
			{aside}
		</header>
	);
}

export function Page({
	footer,
	children,
	...header
}: PageHeaderProps & { footer?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<PageHeader {...header} />
			<UiScrollArea className="min-h-0 flex-1">{children}</UiScrollArea>
			{footer !== undefined && (
				<div className="border-border/60 shrink-0 border-t px-5 py-3">{footer}</div>
			)}
		</div>
	);
}
