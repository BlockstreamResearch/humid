import { ArrowDownLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs from "dayjs";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type {
	PortfolioViewActivity,
	PortfolioViewActivityFeed,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { formatUnits, handleTimestamp } from "@/helpers/formatters";
import { UiSpinner } from "@/ui/UiSpinner";

import { LiquidTxDetailSheet } from "./LiquidTxDetailSheet";
import { LiquidTxStatusBadge } from "./LiquidTxStatus";

export function LiquidAssetView({
	actions,
	activity,
	chain,
	token,
}: {
	actions: ReactNode;
	activity: PortfolioViewActivityFeed;
	chain: ChainRecord;
	token: PortfolioViewAsset;
}) {
	return (
		<>
			<div className="flex flex-col items-center gap-0.5 py-2">
				<p className="font-mono text-2xl font-semibold tracking-tight">
					{formatUnits(token.amount, token.decimals)} {token.symbol}
				</p>
			</div>
			{actions}
			<LiquidActivityList
				chain={chain}
				decimals={token.decimals}
				feed={activity}
				symbol={token.symbol}
			/>
		</>
	);
}

function LiquidActivityList({
	chain,
	decimals,
	feed,
	symbol,
}: {
	chain: ChainRecord;
	decimals: number;
	feed: PortfolioViewActivityFeed;
	symbol: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
				Activity
			</p>
			<LiquidActivityBody chain={chain} decimals={decimals} feed={feed} symbol={symbol} />
		</div>
	);
}

const ESTIMATED_ROW_HEIGHT = 64;
const ACTIVITY_SCROLL_SELECTOR = '[data-slot="scroll-area-viewport"]';

type ActivityRow =
	| { kind: "header"; label: string }
	| { item: PortfolioViewActivity; kind: "item" };

function buildActivityRows(items: PortfolioViewActivity[]): ActivityRow[] {
	const now = dayjs();
	const todayKey = now.format("YYYY-MM-DD");
	const yesterdayKey = now.subtract(1, "day").format("YYYY-MM-DD");

	const labelFor = (item: PortfolioViewActivity): string => {
		if (item.status === "pending" || item.timestamp === null) return "Pending";

		const day = handleTimestamp(item.timestamp);
		const dayKey = day.format("YYYY-MM-DD");

		if (dayKey === todayKey) return "Today";
		if (dayKey === yesterdayKey) return "Yesterday";

		return day.format("MMM D, YYYY");
	};

	const rows: ActivityRow[] = [];
	let currentLabel: string | null = null;

	for (const item of items) {
		const label = labelFor(item);

		if (label !== currentLabel) {
			rows.push({ kind: "header", label });
			currentLabel = label;
		}

		rows.push({ item, kind: "item" });
	}

	return rows;
}

function ActivitySectionHeader({ label }: { label: string }) {
	return (
		<p className="text-muted-foreground px-1 pt-3 pb-1 text-[0.7rem] font-medium tracking-wide uppercase">
			{label}
		</p>
	);
}

function LiquidActivityBody({
	chain,
	decimals,
	feed,
	symbol,
}: {
	chain: ChainRecord;
	decimals: number;
	feed: PortfolioViewActivityFeed;
	symbol: string;
}) {
	const [selected, setSelected] = useState<PortfolioViewActivity | null>(null);
	const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
	const [scrollMargin, setScrollMargin] = useState(0);
	const listRef = useRef<HTMLDivElement | null>(null);

	const setListEl = useCallback((node: HTMLDivElement | null) => {
		listRef.current = node;
		setScrollEl(node?.closest<HTMLElement>(ACTIVITY_SCROLL_SELECTOR) ?? null);
	}, []);

	const { hasMore, isLoadingMore, onLoadMore } = feed;

	const rows = useMemo(() => buildActivityRows(feed.items), [feed.items]);
	const count = rows.length;

	const virtualizer = useVirtualizer({
		count,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		getItemKey: (index) => {
			const row = rows[index];

			if (!row) return index;

			return row.kind === "header" ? `header:${row.label}` : row.item.id;
		},
		getScrollElement: () => scrollEl,
		overscan: 6,
		scrollMargin,
	});

	useLayoutEffect(() => {
		const list = listRef.current;

		if (!scrollEl || !list) return;

		const measure = () => {
			const next =
				list.getBoundingClientRect().top -
				scrollEl.getBoundingClientRect().top +
				scrollEl.scrollTop;

			setScrollMargin((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
		};

		measure();
		const observer = new ResizeObserver(measure);

		observer.observe(scrollEl);

		return () => observer.disconnect();
	}, [scrollEl, count]);

	const virtualItems = virtualizer.getVirtualItems();
	const lastIndex = virtualItems.at(-1)?.index ?? -1;

	useEffect(() => {
		if (count > 0 && lastIndex >= count - 1 && hasMore && !isLoadingMore) {
			onLoadMore();
		}
	}, [count, lastIndex, hasMore, isLoadingMore, onLoadMore]);

	if (count === 0) {
		if (feed.isLoading) {
			return (
				<div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
					<UiSpinner className="size-4" /> Loading…
				</div>
			);
		}

		if (feed.error) {
			return (
				<p className="text-muted-foreground px-1 py-6 text-center text-sm">
					Couldn&apos;t load activity.
				</p>
			);
		}

		return <p className="text-muted-foreground px-1 py-6 text-center text-sm">No activity yet.</p>;
	}

	return (
		<div className="flex flex-col">
			<div
				ref={setListEl}
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualItems.map((virtualItem) => {
					const row = rows[virtualItem.index];

					if (!row) return null;

					return (
						<div
							key={virtualItem.key}
							ref={virtualizer.measureElement}
							data-index={virtualItem.index}
							className="absolute top-0 left-0 w-full"
							style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
						>
							{row.kind === "header" ? (
								<ActivitySectionHeader label={row.label} />
							) : (
								<LiquidActivityRow
									decimals={decimals}
									item={row.item}
									onOpen={() => setSelected(row.item)}
									symbol={symbol}
								/>
							)}
						</div>
					);
				})}
			</div>

			{feed.isLoadingMore ? (
				<div className="text-muted-foreground flex items-center justify-center gap-2 py-3 text-xs">
					<UiSpinner className="size-3" /> Loading…
				</div>
			) : null}

			<LiquidTxDetailSheet
				chain={chain}
				decimals={decimals}
				item={selected}
				onClose={() => setSelected(null)}
				symbol={symbol}
			/>
		</div>
	);
}

function LiquidActivityRow({
	decimals,
	item,
	onOpen,
	symbol,
}: {
	decimals: number;
	item: PortfolioViewActivity;
	onOpen: () => void;
	symbol: string;
}) {
	const isSent = item.direction === "sent";
	const isPending = item.status === "pending";

	return (
		<button
			className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors"
			onClick={onOpen}
			type="button"
		>
			<div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
				<HugeiconsIcon icon={isSent ? ArrowUpRight01Icon : ArrowDownLeft01Icon} size={16} />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="text-sm font-medium capitalize">{item.direction}</p>
					{isPending ? <LiquidTxStatusBadge status="pending" /> : null}
				</div>
				<p className="text-muted-foreground truncate text-xs">
					{isSent ? "To" : "From"}: {item.counterparty}
				</p>
			</div>
			<p className="text-right font-mono text-sm">
				{isSent ? "−" : "+"}
				{formatUnits(item.amount, decimals)} {symbol}
			</p>
		</button>
	);
}
