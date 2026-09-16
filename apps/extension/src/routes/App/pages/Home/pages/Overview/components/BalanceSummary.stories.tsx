import type { Meta, StoryObj } from "@storybook/react-vite";

import { MockHomeProvider } from "@/routes/App/pages/Home/HomeContext/mock";

import { BalanceSummary } from "./BalanceSummary";

const meta = {
	title: "Pages/App/Home/Overview/BalanceSummary",
	component: BalanceSummary,
	decorators: [
		(Story) => (
			<MockHomeProvider>
				<Story />
			</MockHomeProvider>
		),
	],
	args: {
		error: null,
		isSyncing: false,
		native: { amount: 245_000_000n, decimals: 8, symbol: "L-BTC" },
	},
} satisfies Meta<typeof BalanceSummary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Syncing: Story = { args: { isSyncing: true } };

export const EmptySyncing: Story = { args: { isSyncing: true, native: null } };

export const SyncError: Story = { args: { error: "Network request failed", native: null } };
