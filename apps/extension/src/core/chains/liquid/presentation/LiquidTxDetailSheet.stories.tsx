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

export const ConfirmedSent: Story = {
	args: { item: confirmedSent },
};

export const ConfirmedReceived: Story = {
	args: { item: confirmedReceived },
};

export const PendingSent: Story = {
	args: { item: pendingSent },
};

export const NoExplorer: Story = {
	args: { chain: mockLiquidChainNoExplorer, item: confirmedSent },
};
