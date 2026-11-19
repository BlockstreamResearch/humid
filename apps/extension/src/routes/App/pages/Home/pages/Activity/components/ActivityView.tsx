import {
	ArrowDataTransferHorizontalIcon,
	ArrowDown01Icon,
	ArrowDownLeft01Icon,
	ArrowUpRight01Icon,
	CheckmarkCircle02Icon,
	Copy01Icon,
	LinkSquare02Icon,
	SquareLock02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import dayjs from "dayjs";
import type { ReactNode } from "react";

import { Page } from "@/common/Page";
import type {
	ActivityEntry,
	HeldTransaction,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { liquidExplorerTxUrl } from "@/core/chains/liquid/presentation/liquidExplorerTxUrl";
import { formatTimeAgo, formatUnits, handleTimestamp, truncateMiddle } from "@/helpers/formatters";
import { cn } from "@/theme/utils";
import { UiButton } from "@/ui/UiButton/base";
import { UiCollapsible, UiCollapsibleContent, UiCollapsibleTrigger } from "@/ui/UiCollapsible";
import { UiCopyButton } from "@/ui/UiCopyButton";
import { UiSpinner } from "@/ui/UiSpinner";

import type { AccountActivity } from "../useAccountActivity";

type Change = ActivityEntry["changes"][number];

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
	const assets = new AssetNames(tokens);
	const waiting = activity.held.length + activity.pending.length;

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
								onRelease={activity.onRelease}
								releasing={activity.releasing === transaction.txid}
								transaction={transaction}
							/>
						))}
						{activity.pending.map((entry) => (
							<TransactionRow assets={assets} chain={chain} entry={entry} key={entry.txid} />
						))}
					</Section>
				) : null}

				{byDay(activity.items, now).map(([day, entries]) => (
					<Section key={day} label={day}>
						{entries.map((entry) => (
							<TransactionRow assets={assets} chain={chain} entry={entry} key={entry.txid} />
						))}
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
	onRelease,
	releasing,
	transaction,
}: {
	assets: AssetNames;
	now: number;
	onRelease: (txid: string) => void;
	releasing: boolean;
	transaction: HeldTransaction;
}) {
	return (
		<Row
			amount={transaction.holding[0] && assets.amount(transaction.holding[0], false)}
			held
			icon={SquareLock02Icon}
			subtitle={`Signed ${formatTimeAgo(transaction.at, now)}, not sent`}
			title={titleOf(transaction)}
		>
			<Detail label="Locked until it reaches the chain">
				{transaction.holding.map((coins) => (
					<p className="font-mono" key={coins.rawAssetId}>
						{assets.amount(coins, false)}
					</p>
				))}
			</Detail>
			<TransactionId txid={transaction.txid} />
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs">
					Release coins only when the dapp will not send the transaction.
				</p>
				<UiButton
					disabled={releasing}
					onClick={() => onRelease(transaction.txid)}
					size="xs"
					type="button"
					variant="outline"
				>
					Release
				</UiButton>
			</div>
		</Row>
	);
}

function TransactionRow({
	assets,
	chain,
	entry,
}: {
	assets: AssetNames;
	chain: ChainRecord;
	entry: ActivityEntry;
}) {
	const spends = entry.changes.some(({ amountSats }) => amountSats.startsWith("-"));
	const primary = assets.primary(entry.changes);
	const explorer = liquidExplorerTxUrl(chain, entry.txid);

	return (
		<Row
			amount={primary && assets.amount(primary, true)}
			icon={
				entry.label
					? ArrowDataTransferHorizontalIcon
					: spends
						? ArrowUpRight01Icon
						: ArrowDownLeft01Icon
			}
			subtitle={
				entry.timestamp === null
					? "Waiting for the confirmation"
					: handleTimestamp(entry.timestamp).format("HH:mm")
			}
			title={entry.label ? titleOf(entry.label) : spends ? "Sent" : "Received"}
		>
			<Detail label="Changes">
				{entry.changes.map((change) => (
					<p className="font-mono" key={change.rawAssetId}>
						{assets.amount(change, true)}
					</p>
				))}
			</Detail>
			{spends && entry.feeSats !== "0" ? (
				<Detail label="Network fee">
					<p className="font-mono">{assets.amount(assets.fee(entry.feeSats), false)}</p>
				</Detail>
			) : null}
			<TransactionId txid={entry.txid} />
			{explorer ? (
				<a
					className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
					href={explorer}
					rel="noreferrer"
					target="_blank"
				>
					<HugeiconsIcon icon={LinkSquare02Icon} size={14} /> View in explorer
				</a>
			) : null}
		</Row>
	);
}

function Row({
	amount,
	children,
	held = false,
	icon,
	subtitle,
	title,
}: {
	amount: string | undefined;
	children: ReactNode;
	held?: boolean;
	icon: IconSvgElement;
	subtitle: string;
	title: string;
}) {
	return (
		<UiCollapsible
			className={cn(
				held && "bg-info text-info-foreground ring-info-accent/40 my-1 rounded-lg ring-1",
			)}
		>
			<UiCollapsibleTrigger
				className={cn(
					"group flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors",
					held ? "px-2 hover:brightness-95" : "hover:bg-accent",
				)}
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
					className={cn(
						"shrink-0 transition-transform group-data-[panel-open]:rotate-180",
						held ? "text-info-accent" : "text-muted-foreground/50",
					)}
					icon={ArrowDown01Icon}
					size={16}
				/>
			</UiCollapsibleTrigger>
			<UiCollapsibleContent
				className={cn(
					"flex flex-col gap-2 text-xs",
					held ? "px-3 pt-1 pb-3 pl-13" : "mb-2 ml-12 rounded-lg border px-3 py-2",
				)}
			>
				{children}
			</UiCollapsibleContent>
		</UiCollapsible>
	);
}

function Detail({ children, label }: { children: ReactNode; label: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<p className="text-muted-foreground">{label}</p>
			{children}
		</div>
	);
}

function TransactionId({ txid }: { txid: string }) {
	return (
		<Detail label="Transaction">
			<div className="flex items-center gap-1">
				<p className="font-mono">{truncateMiddle(txid, 10, 8)}</p>
				<UiCopyButton
					className="text-muted-foreground hover:text-foreground rounded p-0.5"
					value={txid}
				>
					{(copied) => (
						<HugeiconsIcon
							aria-label={copied ? "Copied" : "Copy transaction ID"}
							icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
							size={13}
						/>
					)}
				</UiCopyButton>
			</div>
		</Detail>
	);
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

	amount({ amountSats, rawAssetId }: Change, signed: boolean): string {
		const negative = amountSats.startsWith("-");
		const units = negative ? amountSats.slice(1) : amountSats;
		const sign = signed ? (negative ? "−" : "+") : "";
		const token = this.#tokens.find(({ id }) => id === rawAssetId);

		return token
			? `${sign}${formatUnits(units, token.decimals)} ${token.symbol}`
			: `${sign}${units} of unknown asset ${truncateMiddle(rawAssetId, 4, 4)}, raw units`;
	}

	#native(): PortfolioViewAsset | undefined {
		return this.#tokens.find(({ metadata }) => (metadata as { isNative?: boolean })?.isNative);
	}

	#isNative(rawAssetId: string): boolean {
		return this.#native()?.id === rawAssetId;
	}
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
