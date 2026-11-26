import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ConfirmationFailure, TransactionReceipt } from "./TransactionReceipt";

const LBTC = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = `3f9a${"5c".repeat(28)}c21e`;
const TXID = "7e1c4f0a9b2d83e65c0f7a41d9b3e2c8a05f6d17e3b9c2a4d80f1e6b7c3a95d2";

const meta = {
	title: "Confirmation/TransactionReceipt",
	component: TransactionReceipt,
	args: {
		receipt: {
			assets: { [LBTC]: { decimals: 8, ticker: "L-BTC" } },
			changes: [
				{ amount: "-500052", asset: LBTC },
				{ amount: "1", asset: TOKEN },
			],
			explorerUrl: `https://blockstream.info/liquidtestnet/tx/${TXID}`,
			fee: "52 sats",
			network: "Liquid Testnet",
			txid: TXID,
		},
		origin: "https://app.lending.example",
		onDone: fn(),
	},
} satisfies Meta<typeof TransactionReceipt>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sent: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("Transaction sent")).toBeVisible();
		await expect(canvas.getByText(TXID)).toBeVisible();
		await expect(canvas.getByRole("link", { name: /view on explorer/i })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Done" }));
		await expect(args.onDone).toHaveBeenCalled();
	},
};

export const SignedNotSent: Story = {
	args: {
		receipt: { ...meta.args.receipt, explorerUrl: undefined, txid: undefined },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("Signed and returned")).toBeVisible();
		await expect(canvas.getByText(/app\.lending\.example now holds the signature/)).toBeVisible();
		await expect(canvas.queryByRole("link", { name: /view on explorer/i })).toBeNull();
	},
};

export const Failed: Story = {
	render: (args) => (
		<ConfirmationFailure
			message="Could not sign and broadcast the transaction."
			origin={args.origin}
			onClose={args.onDone}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("The request failed")).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Close" })).toBeVisible();
	},
};
