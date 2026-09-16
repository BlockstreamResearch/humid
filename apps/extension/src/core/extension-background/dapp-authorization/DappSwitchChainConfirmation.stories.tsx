import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { DappSwitchChainConfirmation } from "./DappSwitchChainConfirmation";

const meta = {
	title: "Dapp/SwitchChainConfirmation",
	component: DappSwitchChainConfirmation,
	args: {
		data: {
			chainId: "bip122:a771da8e52ee6ad581ed1e9a99825e5b",
			chainName: "Liquid Testnet",
			kind: "dappSwitchChain",
			origin: "https://app.example.org",
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DappSwitchChainConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Approve: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /use network/i }));

		await expect(args.onConfirm).toHaveBeenCalled();
	},
};
