import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewActivity } from "@/core/chains/application/PortfolioView";
import { UiButton } from "@/ui/UiButton/base";

import {
	confirmedReceived,
	confirmedSent,
	mockLiquidChain,
	mockLiquidChainNoExplorer,
	pendingSent,
} from "./liquidStoryFixtures";
import { LiquidTxDetailSheet } from "./LiquidTxDetailSheet";

/**
 * The sheet is controlled by `item` (non-null opens it). The harness starts open so the drawer is
 * visible on load, and wires a trigger button so it can be re-opened after closing.
 */
function DetailSheetHarness({
	chain,
	decimals,
	item,
	symbol,
}: {
	chain: ChainRecord;
	decimals: number;
	item: PortfolioViewActivity;
	symbol: string;
}) {
	const [open, setOpen] = useState(true);

	return (
		<div className="flex size-full flex-col items-center justify-center gap-3 p-5">
			<p className="text-muted-foreground text-sm">Tap a transaction to see its detail.</p>
			<UiButton onClick={() => setOpen(true)} variant="outline">
				Open transaction
			</UiButton>
			<LiquidTxDetailSheet
				chain={chain}
				decimals={decimals}
				item={open ? item : null}
				onClose={() => setOpen(false)}
				symbol={symbol}
			/>
		</div>
	);
}

const meta = {
	title: "Chains/Liquid/LiquidTxDetailSheet",
	component: LiquidTxDetailSheet,
	render: ({ chain, decimals, item, symbol }) => (
		<DetailSheetHarness
			chain={chain}
			decimals={decimals}
			item={item ?? confirmedSent}
			symbol={symbol}
		/>
	),
	args: {
		chain: mockLiquidChain,
		decimals: 8,
		item: confirmedSent,
		onClose: () => {},
		symbol: "L-BTC",
	},
} satisfies Meta<typeof LiquidTxDetailSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A confirmed send: signed amount, "Confirmed" status, and the network fee. */
export const ConfirmedSent: Story = {
	args: { item: confirmedSent },
};

/** A confirmed receive. */
export const ConfirmedReceived: Story = {
	args: { item: confirmedReceived },
};

/** An optimistic pending send: the amber "Pending" status and an unknown ("—") fee. */
export const PendingSent: Story = {
	args: { item: pendingSent },
};

/** With no explorer configured, the "view on explorer" button is omitted. */
export const NoExplorer: Story = {
	args: { chain: mockLiquidChainNoExplorer, item: confirmedSent },
};
