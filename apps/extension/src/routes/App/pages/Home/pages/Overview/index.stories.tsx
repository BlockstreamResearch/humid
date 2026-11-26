import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { LIQUID_MAINNET_CHAIN_ID } from "@/core/chains/liquid/domain/LiquidChain";

import { MockHomeProvider } from "../../HomeContext/mock";
import { MOCK_LBTC_ID } from "../../HomeContext/mockAssets";
import { accountActivityQueryKey, heldTransactionsQueryKey } from "../Activity/useAccountActivity";
import { OverviewPage } from "./index";

const meta = {
	title: "Pages/App/Home/Overview",
	component: OverviewPage,
	decorators: [
		(Story) => (
			<MockHomeProvider>
				<Story />
			</MockHomeProvider>
		),
	],
} satisfies Meta<typeof OverviewPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function pendingClient(): QueryClient {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	const keys = ["account-group:stub-1", LIQUID_MAINNET_CHAIN_ID] as const;

	client.setQueryData(heldTransactionsQueryKey(...keys), [
		{
			action: "Pay",
			at: Date.now() - 3 * 60_000,
			holding: [{ amountSats: "50000", rawAssetId: MOCK_LBTC_ID }],
			origin: "https://dapp.example.org",
			txid: "ab".repeat(32),
		},
	]);
	client.setQueryData(accountActivityQueryKey(...keys), {
		pageParams: [null],
		pages: [
			{
				items: [
					{
						changes: [{ amountSats: "-1200", rawAssetId: MOCK_LBTC_ID }],
						feeSats: "200",
						timestamp: null,
						txid: "d1".repeat(32),
					},
				],
				nextCursor: null,
			},
		],
	});

	return client;
}

export const Pending: Story = {
	decorators: [
		(Story) => {
			const [client] = useState(pendingClient);

			return (
				<QueryClientProvider client={client}>
					<Story />
				</QueryClientProvider>
			);
		},
	],
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByRole("link", { name: /Activity/ })).toBeVisible();
		await expect(canvas.getByLabelText("2 pending")).toBeVisible();
	},
};
