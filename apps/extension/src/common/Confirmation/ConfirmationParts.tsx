import { Alert02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { cn } from "@/theme/utils.ts";

import type { ShownAsset } from "./ShownAsset";

const MARK_COLOURS = [
	"#7c3aed",
	"#f59e0b",
	"#0891b2",
	"#e11d48",
	"#10b981",
	"#3b82f6",
	"#f97316",
	"#d946ef",
];

export function ConfirmationSection({
	title,
	aside,
	children,
}: {
	title: string;
	aside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="border-border rounded-lg border px-3 py-1">
			<header className="mt-2 mb-1 flex items-center justify-between gap-2">
				<h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
					{title}
				</h2>
				{aside}
			</header>
			{children}
		</section>
	);
}

export function AssetMark({ asset }: { asset: ShownAsset }) {
	if (asset.ticker !== undefined) {
		return (
			<span
				aria-hidden="true"
				className="bg-muted border-border flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
			>
				{asset.ticker.charAt(0)}
			</span>
		);
	}

	return (
		<span
			aria-hidden="true"
			className="grid size-7 shrink-0 grid-cols-2 overflow-hidden rounded-full"
		>
			{[0, 1, 2, 3].map((cell) => (
				<span key={cell} style={{ background: markColour(asset.id, cell) }} />
			))}
		</span>
	);
}

export function AmountRow({
	asset,
	units,
	note,
}: {
	asset: ShownAsset;
	units: bigint;
	note?: string;
}) {
	const shownNote = note ?? asset.note;

	return (
		<div className="flex items-center gap-2.5 py-2.5">
			<AssetMark asset={asset} />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className={cn(
						"truncate text-sm font-semibold",
						asset.ticker === undefined && "font-mono",
					)}
				>
					{asset.label}
				</span>
				{shownNote !== undefined && (
					<span className="text-muted-foreground text-xs">{shownNote}</span>
				)}
			</span>
			<span
				className={cn(
					"font-mono text-sm font-semibold tabular-nums",
					units < 0n ? "text-foreground" : "text-emerald-600 dark:text-emerald-400",
				)}
			>
				{asset.amount(units, true)}
			</span>
		</div>
	);
}

export function FactRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="border-border/60 flex flex-col gap-0.5 border-t py-2.5 first-of-type:border-t-0">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className={cn("text-sm font-semibold break-all", mono && "font-mono font-normal")}>
				{value}
			</span>
		</div>
	);
}

export function TextBlock({
	title,
	byDapp = false,
	children,
}: {
	title: string;
	byDapp?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-1.5">
			<h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
				{title}
			</h2>
			<div className="bg-muted max-h-38 overflow-y-auto rounded-lg px-3 py-2.5 text-sm leading-5 break-words whitespace-pre-wrap">
				{children}
			</div>
			{byDapp && <DappProvided />}
		</section>
	);
}

export function ConfirmationNote({
	tone = "info",
	children,
}: {
	tone?: "info" | "warning";
	children: ReactNode;
}) {
	return (
		<div
			role="note"
			className={cn(
				"flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px] leading-[18px]",
				tone === "info" ? "bg-info text-info-foreground" : "bg-warning text-warning-foreground",
			)}
		>
			<HugeiconsIcon
				icon={tone === "info" ? InformationCircleIcon : Alert02Icon}
				className={cn(
					"mt-px size-4 shrink-0",
					tone === "info" ? "text-info-accent" : "text-warning-accent",
				)}
			/>
			<span>{children}</span>
		</div>
	);
}

export function DappProvided({ children = "Provided by the dapp" }: { children?: ReactNode }) {
	return <span className="text-dapp text-xs">{children}</span>;
}

function markColour(id: string, cell: number): string {
	const byte = Number.parseInt(id.slice(cell * 2, cell * 2 + 2), 16) || 0;
	return MARK_COLOURS[byte % MARK_COLOURS.length]!;
}
