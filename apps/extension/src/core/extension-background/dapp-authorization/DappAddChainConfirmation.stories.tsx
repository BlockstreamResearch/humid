import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { DappAddChainConfirmation } from "./DappAddChainConfirmation";

const meta = {
	title: "Dapp/AddChainConfirmation",
	component: DappAddChainConfirmation,
	args: {
		data: {
			backendUrl: "https://esplora.example.org/liquid/api",
			kind: "dappAddChain",
			name: "Liquid Regtest",
			network: "regtest",
			origin: "https://app.example.org",
			waterfalls: false,
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DappAddChainConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Waterfalls: Story = {
	args: {
		data: {
			...meta.args.data,
			explorerUrl: "https://explorer.example.org",
			waterfalls: true,
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("https://explorer.example.org")).toBeVisible();
		await expect(canvas.getByText(/learns the account's public key/)).toBeVisible();
	},
};

export const Confirms: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /add network/i }));

		await expect(args.onConfirm).toHaveBeenCalled();
	},
};
