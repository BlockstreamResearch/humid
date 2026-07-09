import type { Meta, StoryObj } from "@storybook/react-vite";

import { LiquidBalanceHeadline } from "./LiquidBalanceHeadline";

const meta = {
	title: "Chains/Liquid/LiquidBalanceHeadline",
	component: LiquidBalanceHeadline,
	render: (args) => (
		<div className="flex size-full items-center justify-center p-5">
			<LiquidBalanceHeadline {...args} />
		</div>
	),
	args: {
		isSyncing: false,
		native: { amount: 245_000_000n, decimals: 8, symbol: "L-BTC" },
	},
} satisfies Meta<typeof LiquidBalanceHeadline>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The settled balance headline. */
export const Amount: Story = {};

/** While the open popup re-syncs the portfolio, a subtle "Syncing…" hint appears under the amount. */
export const Syncing: Story = {
	args: { isSyncing: true },
};
