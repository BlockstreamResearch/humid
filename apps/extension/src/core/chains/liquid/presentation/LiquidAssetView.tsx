import { ArrowDownLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type {
	PortfolioViewActivity,
	PortfolioViewActivityFeed,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { formatUnits } from "@/helpers/formatters";
import { UiSpinner } from "@/ui/UiSpinner";

import { LiquidTxDetailSheet } from "./LiquidTxDetailSheet";
import { LiquidTxStatusBadge } from "./LiquidTxStatus";

/** Liquid asset detail body: the balance headline, the account actions, and the tx history. */
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

/** Liquid transaction history: the section label plus the (virtualized) list body. */
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
/** The asset page mounts this list inside a base-ui ScrollArea; its viewport is the real scroller. */
const ACTIVITY_SCROLL_SELECTOR = '[data-slot="scroll-area-viewport"]';

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

	// The activity list is only one section of the asset page's shared scroll container (the balance,
	// actions, and About panel sit above it), so we virtualize against that container — the base-ui
	// ScrollArea viewport this list is mounted in — rather than a window or a nested scroller.
	const setListEl = useCallback((node: HTMLDivElement | null) => {
		listRef.current = node;
		setScrollEl(node?.closest<HTMLElement>(ACTIVITY_SCROLL_SELECTOR) ?? null);
	}, []);

	const { hasMore, isLoadingMore, onLoadMore } = feed;
	const count = feed.items.length;

	const virtualizer = useVirtualizer({
		count,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		getItemKey: (index) => feed.items[index]?.id ?? index,
		getScrollElement: () => scrollEl,
		overscan: 6,
		scrollMargin,
	});

	// Measure where the list starts within the scroll container so virtual rows land below the content
	// above them. That content is fixed height, so a mount measure plus a viewport-resize observer keep
	// the offset accurate without watching every ancestor.
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

	// Auto-load-more: once the tail row is realized (a little early, thanks to overscan) pull the next
	// page. onLoadMore is itself a no-op while a page is in flight, so the guards are belt-and-braces.
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
					const item = feed.items[virtualItem.index];

					if (!item) return null;

					return (
						<div
							key={virtualItem.key}
							ref={virtualizer.measureElement}
							data-index={virtualItem.index}
							className="absolute top-0 left-0 w-full"
							style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
						>
							<LiquidActivityRow
								decimals={decimals}
								item={item}
								onOpen={() => setSelected(item)}
								symbol={symbol}
							/>
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

/** One activity row: direction glyph, direction + (pending) status, date/counterparty, signed amount. */
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
					{isPending ? "" : `${item.date} · `}
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
