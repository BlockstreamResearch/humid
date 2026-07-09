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
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DappAddChainConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The add-chain approval: proposed name, network, and (security-sensitive) backend URL. */
export const Default: Story = {};

/** Approving fires onConfirm so the wallet mints its own id and persists the chain. */
export const Approve: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /add network/i }));

		await expect(args.onConfirm).toHaveBeenCalled();
	},
};
