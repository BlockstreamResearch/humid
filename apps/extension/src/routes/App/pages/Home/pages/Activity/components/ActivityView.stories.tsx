import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
	issuedVerifiedToken,
	mockLiquidChain,
	nativeToken,
} from "@/core/chains/liquid/presentation/liquidStoryFixtures";

import type { AccountActivity } from "../useAccountActivity";
import { ActivityView } from "./ActivityView";

const NOW = new Date(2026, 10, 19, 15, 0).getTime();
const SECOND = 1000;
const HELD = "ab".repeat(32);

const activity: AccountActivity = {
	error: false,
	hasMore: false,
	held: [
		{
			action: "Pay",
			at: NOW - 3 * 60 * SECOND,
			holding: [
				{ amountSats: "50000", rawAssetId: nativeToken.id },
				{ amountSats: "21", rawAssetId: "cd".repeat(32) },
			],
			origin: "https://dapp.example.org",
			txid: HELD,
		},
	],
	isLoading: false,
	isLoadingMore: false,
	items: [
		{
			changes: [
				{ amountSats: "-1300", rawAssetId: nativeToken.id },
				{ amountSats: "500000000", rawAssetId: issuedVerifiedToken.id },
			],
			feeSats: "300",
			label: { action: "Settle", origin: "https://dex.example.org" },
			timestamp: (NOW - 2 * 3600 * SECOND) / SECOND,
			txid: "c1".repeat(32),
		},
		{
			changes: [{ amountSats: "-100500", rawAssetId: nativeToken.id }],
			feeSats: "500",
			timestamp: (NOW - 26 * 3600 * SECOND) / SECOND,
			txid: "c2".repeat(32),
		},
		{
			changes: [{ amountSats: "2500000", rawAssetId: nativeToken.id }],
			feeSats: "250",
			timestamp: (NOW - 50 * 3600 * SECOND) / SECOND,
			txid: "c3".repeat(32),
		},
	],
	onLoadMore: fn(),
	onRelease: fn(),
	pending: [
		{
			changes: [{ amountSats: "-1200", rawAssetId: nativeToken.id }],
			feeSats: "200",
			label: { action: "Fund", origin: "https://will.example.org" },
			timestamp: null,
			txid: "d1".repeat(32),
		},
	],
	releasing: null,
};

const meta = {
	title: "Pages/App/Home/Activity",
	component: ActivityView,
	args: {
		activity,
		chain: mockLiquidChain,
		now: NOW,
		tokens: [nativeToken, issuedVerifiedToken],
	},
} satisfies Meta<typeof ActivityView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("Pending")).toBeVisible();
		await expect(canvas.getByText("Settle · dex.example.org")).toBeVisible();
		await expect(canvas.getByText("Today")).toBeVisible();
		await expect(canvas.getByText("Yesterday")).toBeVisible();
	},
};

export const ReleasingHeldCoins: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByText("Pay · dapp.example.org"));
		await expect(canvas.getByText(/21 of unknown asset/)).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Release" }));
		await expect(args.activity.onRelease).toHaveBeenCalledWith(HELD);
	},
};

export const Empty: Story = {
	args: { activity: { ...activity, held: [], items: [], pending: [] } },
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByText("No activity yet.")).toBeVisible();
	},
};

export const Loading: Story = {
	args: { activity: { ...activity, held: [], isLoading: true, items: [], pending: [] } },
};
