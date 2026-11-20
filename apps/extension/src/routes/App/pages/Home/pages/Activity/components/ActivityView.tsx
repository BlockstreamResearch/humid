import {
	ArrowDataTransferHorizontalIcon,
	ArrowDownLeft01Icon,
	ArrowRight01Icon,
	ArrowUpRight01Icon,
	SquareLock02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import dayjs from "dayjs";
import { type ReactNode, useState } from "react";

import { Page } from "@/common/Page";
import type {
	ActivityEntry,
	HeldTransaction,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { liquidExplorerTxUrl } from "@/core/chains/liquid/presentation/liquidExplorerTxUrl";
import { UNLISTED_ASSET_NOTE } from "@/core/chains/liquid/presentation/LiquidTxDetailSheet";
import { LiquidTxStatusBadge } from "@/core/chains/liquid/presentation/LiquidTxStatus";
import {
	TransactionSheet,
	type TransactionSheetContent,
} from "@/core/chains/liquid/presentation/TransactionSheet";
import { formatTimeAgo, formatUnits, handleTimestamp, truncateMiddle } from "@/helpers/formatters";
import { cn } from "@/theme/utils";
import { UiBadge } from "@/ui/UiBadge";
import { UiButton } from "@/ui/UiButton/base";
import { UiSpinner } from "@/ui/UiSpinner";

import type { AccountActivity } from "../useAccountActivity";

type Change = ActivityEntry["changes"][number];

type Selected = { held: HeldTransaction } | { entry: ActivityEntry };

export function ActivityView({
	activity,
	chain,
	now = Date.now(),
	tokens,
}: {
	activity: AccountActivity;
	chain: ChainRecord;
	now?: number;
	tokens: PortfolioViewAsset[];
}) {
	const [selected, setSelected] = useState<Selected | null>(null);
	const assets = new AssetNames(tokens);
	const waiting = activity.held.length + activity.pending.length;
	const entryRow = (entry: ActivityEntry) => (
		<TransactionRow
			assets={assets}
			entry={entry}
			key={entry.txid}
			onOpen={() => setSelected({ entry })}
		/>
	);

	return (
		<Page back={{ label: "Back", to: "/app" }} title="Activity">
			<div className="flex flex-col px-4 py-3">
				{waiting > 0 ? (
					<Section label="Pending">
						{activity.held.map((transaction) => (
							<HeldRow
								assets={assets}
								key={transaction.txid}
								now={now}
								onOpen={() => setSelected({ held: transaction })}
								transaction={transaction}
							/>
						))}
						{activity.pending.map(entryRow)}
					</Section>
				) : null}

				{byDay(activity.items, now).map(([day, entries]) => (
					<Section key={day} label={day}>
						{entries.map(entryRow)}
					</Section>
				))}

				{activity.items.length + waiting === 0 ? <Empty activity={activity} /> : null}

				{activity.hasMore ? (
					<UiButton
						className="mt-2"
						disabled={activity.isLoadingMore}
						onClick={activity.onLoadMore}
						size="sm"
						type="button"
						variant="ghost"
					>
						{activity.isLoadingMore ? "Loading…" : "Show more"}
					</UiButton>
				) : null}
			</div>

			<TransactionSheet
				content={
					selected === null
						? null
						: "held" in selected
							? heldSheet(selected.held, assets, now, {
									onRelease: (txid) => {
										activity.onRelease(txid);
										setSelected(null);
									},
									releasing: activity.releasing === selected.held.txid,
								})
							: entrySheet(selected.entry, assets, chain)
				}
				onClose={() => setSelected(null)}
			/>
		</Page>
	);
}

function Empty({ activity }: { activity: AccountActivity }) {
	if (activity.isLoading) {
		return (
			<div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
				<UiSpinner className="size-4" /> Loading…
			</div>
		);
	}

	return (
		<p className="text-muted-foreground py-6 text-center text-sm">
			{activity.error ? "Couldn't load activity." : "No activity yet."}
		</p>
	);
}

function Section({ children, label }: { children: ReactNode; label: string }) {
	return (
		<section className="flex flex-col">
			<p className="text-muted-foreground px-1 pt-3 pb-1 text-[0.7rem] font-medium tracking-wide uppercase">
				{label}
			</p>
			{children}
		</section>
	);
}

function HeldRow({
	assets,
	now,
	onOpen,
	transaction,
}: {
	assets: AssetNames;
	now: number;
	onOpen: () => void;
	transaction: HeldTransaction;
}) {
	return (
		<Row
			amount={transaction.holding[0] && assets.amount(transaction.holding[0], false)}
			held
			icon={SquareLock02Icon}
			onOpen={onOpen}
			subtitle={`Signed ${formatTimeAgo(transaction.at, now)}, not sent`}
			title={titleOf(transaction)}
		/>
	);
}

function TransactionRow({
	assets,
	entry,
	onOpen,
}: {
	assets: AssetNames;
	entry: ActivityEntry;
	onOpen: () => void;
}) {
	const primary = assets.primary(entry.changes);

	return (
		<Row
			amount={primary && assets.amount(primary, true)}
			icon={iconOf(entry)}
			onOpen={onOpen}
			subtitle={
				entry.timestamp === null
					? "Waiting for the confirmation"
					: handleTimestamp(entry.timestamp).format("HH:mm")
			}
			title={entry.label ? titleOf(entry.label) : spends(entry) ? "Sent" : "Received"}
		/>
	);
}

function Row({
	amount,
	held = false,
	icon,
	onOpen,
	subtitle,
	title,
}: {
	amount: string | undefined;
	held?: boolean;
	icon: IconSvgElement;
	onOpen: () => void;
	subtitle: string;
	title: string;
}) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors",
				held
					? "bg-info text-info-foreground ring-info-accent/40 my-1 px-2 ring-1 hover:brightness-95"
					: "hover:bg-accent",
			)}
			onClick={onOpen}
			type="button"
		>
			<span
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-full",
					held ? "bg-background text-info-accent" : "bg-muted text-muted-foreground",
				)}
			>
				<HugeiconsIcon icon={icon} size={15} />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{title}</span>
				<span
					className={cn(
						"block truncate text-xs",
						held ? "text-info-accent" : "text-muted-foreground",
					)}
				>
					{subtitle}
				</span>
			</span>
			{amount ? <span className="font-mono text-sm">{amount}</span> : null}
			<HugeiconsIcon
				aria-hidden
				className={cn("shrink-0", held ? "text-info-accent" : "text-muted-foreground/50")}
				icon={ArrowRight01Icon}
				size={16}
			/>
		</button>
	);
}

function entrySheet(
	entry: ActivityEntry,
	assets: AssetNames,
	chain: ChainRecord,
): TransactionSheetContent {
	const primary = assets.primary(entry.changes);

	return {
		copies: [
			...assets.unlistedCopies(entry.changes),
			{ label: "Transaction ID", value: entry.txid },
		],
		explorerUrl: liquidExplorerTxUrl(chain, entry.txid),
		headline: primary ? assets.amount(primary, true) : "",
		icon: iconOf(entry),
		rows: [
			...(entry.label ? dappRows(entry.label) : []),
			{
				label: "Date",
				value:
					entry.timestamp === null
						? "Waiting for the confirmation"
						: handleTimestamp(entry.timestamp).format("MMM D, YYYY HH:mm"),
			},
			...(entry.changes.length > 1
				? entry.changes.map((change) => ({
						label: change.amountSats.startsWith("-") ? "Sent" : "Received",
						value: assets.amount(change, false),
					}))
				: []),
			...(spends(entry) && entry.feeSats !== "0"
				? [{ label: "Network fee", value: assets.amount(assets.fee(entry.feeSats), false) }]
				: []),
		],
		status: <LiquidTxStatusBadge status={entry.timestamp === null ? "pending" : "confirmed"} />,
	};
}

function heldSheet(
	transaction: HeldTransaction,
	assets: AssetNames,
	now: number,
	{ onRelease, releasing }: { onRelease: (txid: string) => void; releasing: boolean },
): TransactionSheetContent {
	const [first] = transaction.holding;

	return {
		actions: (
			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs">
					Until the transaction reaches the chain, these coins stay locked. Release them only when
					the dapp will not send the transaction.
				</p>
				<UiButton
					disabled={releasing}
					onClick={() => onRelease(transaction.txid)}
					size="lg"
					type="button"
					variant="outline"
				>
					Release
				</UiButton>
			</div>
		),
		copies: [
			...assets.unlistedCopies(transaction.holding),
			{ label: "Transaction ID", value: transaction.txid },
		],
		explorerUrl: null,
		headline: first ? assets.amount(first, false) : "",
		icon: SquareLock02Icon,
		rows: [
			...dappRows(transaction),
			{ label: "Signed", value: formatTimeAgo(transaction.at, now) },
			...transaction.holding.map((coins) => ({
				label: "Locked",
				value: assets.amount(coins, false),
			})),
		],
		status: (
			<UiBadge className="bg-info text-info-accent">
				<HugeiconsIcon icon={SquareLock02Icon} size={12} />
				Signed, not sent
			</UiBadge>
		),
	};
}

function dappRows({ action, origin }: { action: string; origin: string }) {
	return [
		{ label: "Dapp", value: hostOf(origin) },
		{ label: "Action", value: action },
	];
}

function spends(entry: ActivityEntry): boolean {
	return entry.changes.some(({ amountSats }) => amountSats.startsWith("-"));
}

function iconOf(entry: ActivityEntry): IconSvgElement {
	if (entry.label) return ArrowDataTransferHorizontalIcon;

	return spends(entry) ? ArrowUpRight01Icon : ArrowDownLeft01Icon;
}

class AssetNames {
	readonly #tokens: PortfolioViewAsset[];

	constructor(tokens: PortfolioViewAsset[]) {
		this.#tokens = tokens;
	}

	primary(changes: Change[]): Change | undefined {
		return changes.find(({ rawAssetId }) => !this.#isNative(rawAssetId)) ?? changes[0];
	}

	fee(feeSats: string): Change {
		return { amountSats: feeSats, rawAssetId: this.#native()?.id ?? "" };
	}

	amount(change: Change, signed: boolean): string {
		const token = this.#listed(change.rawAssetId);
		const units = change.amountSats.replace(/^-/u, "");

		return token
			? `${signOf(change, signed)}${formatUnits(units, token.decimals)} ${token.symbol}`
			: `${signOf(change, signed)}${units} ${truncateMiddle(change.rawAssetId, 4, 4)}`;
	}

	unlistedCopies(changes: Change[]) {
		return changes
			.filter(({ rawAssetId }) => this.#listed(rawAssetId) === undefined)
			.map(({ rawAssetId }) => ({
				label: "Asset ID",
				note: UNLISTED_ASSET_NOTE,
				value: rawAssetId,
			}));
	}

	#listed(rawAssetId: string): PortfolioViewAsset | undefined {
		return this.#tokens.find(
			({ id, metadata }) => id === rawAssetId && (metadata as { verified?: boolean })?.verified,
		);
	}

	#native(): PortfolioViewAsset | undefined {
		return this.#tokens.find(({ metadata }) => (metadata as { isNative?: boolean })?.isNative);
	}

	#isNative(rawAssetId: string): boolean {
		return this.#native()?.id === rawAssetId;
	}
}

function signOf({ amountSats }: Change, signed: boolean): string {
	if (!signed) return "";

	return amountSats.startsWith("-") ? "−" : "+";
}

function titleOf({ action, origin }: { action: string; origin: string }): string {
	return `${action} · ${hostOf(origin)}`;
}

function hostOf(origin: string): string {
	try {
		return new URL(origin).host;
	} catch {
		return "a dapp";
	}
}

function byDay(entries: ActivityEntry[], now: number): [string, ActivityEntry[]][] {
	const today = dayjs(now).format("YYYY-MM-DD");
	const yesterday = dayjs(now).subtract(1, "day").format("YYYY-MM-DD");
	const days = new Map<string, ActivityEntry[]>();

	for (const entry of entries) {
		const day = handleTimestamp(entry.timestamp ?? 0);
		const key = day.format("YYYY-MM-DD");
		const label =
			key === today ? "Today" : key === yesterday ? "Yesterday" : day.format("MMM D, YYYY");

		days.set(label, [...(days.get(label) ?? []), entry]);
	}

	return [...days];
}
