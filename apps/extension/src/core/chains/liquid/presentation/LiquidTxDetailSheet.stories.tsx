import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type {
	PortfolioViewActivity,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { UiButton } from "@/ui/UiButton/base";

import {
	confirmedReceived,
	confirmedSent,
	issuedUnverifiedToken,
	mockLiquidChain,
	mockLiquidChainNoExplorer,
	nativeToken,
	pendingSent,
} from "./liquidStoryFixtures";
import { LiquidTxDetailSheet } from "./LiquidTxDetailSheet";

function DetailSheetHarness({
	chain,
	item,
	token,
}: {
	chain: ChainRecord;
	item: PortfolioViewActivity;
	token: PortfolioViewAsset;
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
				item={open ? item : null}
				onClose={() => setOpen(false)}
				token={token}
			/>
		</div>
	);
}

const meta = {
	title: "Chains/Liquid/LiquidTxDetailSheet",
	component: LiquidTxDetailSheet,
	render: ({ chain, item, token }) => (
		<DetailSheetHarness chain={chain} item={item ?? confirmedSent} token={token} />
	),
	args: {
		chain: mockLiquidChain,
		item: confirmedSent,
		onClose: () => {},
		token: nativeToken,
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

export const UnknownAsset: Story = {
	args: { item: confirmedReceived, token: issuedUnverifiedToken },
};
