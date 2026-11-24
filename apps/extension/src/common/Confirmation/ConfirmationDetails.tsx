import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { UiCollapsible, UiCollapsibleContent, UiCollapsibleTrigger } from "@/ui/UiCollapsible";

import { DappProvided } from "./ConfirmationParts";

export function ConfirmationDetails({
	summary,
	children,
}: {
	summary?: string;
	children: ReactNode;
}) {
	return (
		<UiCollapsible defaultOpen className="border-border rounded-lg border">
			<UiCollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 p-3 text-left">
				<span className="flex-1 text-sm font-semibold">Details</span>
				{summary !== undefined && <span className="text-muted-foreground text-xs">{summary}</span>}
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					className="text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180"
				/>
			</UiCollapsibleTrigger>
			<UiCollapsibleContent className="flex flex-col gap-3 px-3 pb-3">
				{children}
			</UiCollapsibleContent>
		</UiCollapsible>
	);
}

export function DetailsGroup({ title, children }: { title?: string; children: ReactNode }) {
	return (
		<div className="flex flex-col">
			{title !== undefined && (
				<h3 className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-wider uppercase">
					{title}
				</h3>
			)}
			{children}
		</div>
	);
}

export function DetailsRow({
	address,
	addressByDapp = false,
	index,
	label,
	note,
	noteByDapp = false,
	value,
}: {
	/** Shown in full, over as many lines as it takes, so every character can be checked. */
	address?: string;
	addressByDapp?: boolean;
	index?: number;
	label: string;
	note?: string;
	noteByDapp?: boolean;
	value?: ReactNode;
}) {
	return (
		<div className="border-border/60 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-t py-2 first-of-type:border-t-0">
			<span className="text-muted-foreground w-4 font-mono text-xs tabular-nums">{index}</span>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate text-[13px] font-semibold">{label}</span>
				{note !== undefined &&
					(noteByDapp ? (
						<DappProvided>{note}</DappProvided>
					) : (
						<span className="text-muted-foreground truncate font-mono text-xs">{note}</span>
					))}
				{address !== undefined && (
					<span
						className={`font-mono text-xs break-all ${addressByDapp ? "text-dapp" : "text-muted-foreground"}`}
					>
						{address}
					</span>
				)}
			</span>
			{value !== undefined && (
				<span className="text-muted-foreground font-mono text-xs tabular-nums">{value}</span>
			)}
		</div>
	);
}

export function count(amount: number, noun: string): string {
	return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}
