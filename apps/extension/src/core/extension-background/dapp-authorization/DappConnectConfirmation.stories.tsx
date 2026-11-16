import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { DappConnectConfirmation } from "./DappConnectConfirmation";

const methods = [
	"getBalance",
	"getUTXOs",
	"getWalletDescriptor",
	"getIdentityPublicKey",
	"signMessage",
	"signPset",
	"sendTransfer",
	"signIdentity",
];

const meta = {
	title: "Dapp/ConnectConfirmation",
	component: DappConnectConfirmation,
	args: {
		data: {
			accounts: [
				{ id: "account-group:1", isConnected: false, isCurrent: true, name: "Account 1" },
				{ id: "account-group:2", isConnected: true, isCurrent: false, name: "Account 2" },
			],
			chains: ["bip122:a771da8e52ee6ad581ed1e9a99825e5b"],
			kind: "dappConnect",
			methods,
			networks: ["Liquid Testnet"],
			origin: "https://app.example.org",
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DappConnectConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByRole("heading", { name: "Connect to app.example.org" })).toBeVisible();
		await expect(canvas.getByText("Liquid Testnet")).toBeVisible();
	},
};

export const NeedsAnAccount: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("checkbox", { name: /account 1/i }));
		await userEvent.click(canvas.getByRole("checkbox", { name: /account 2/i }));
		await expect(canvas.getByRole("button", { name: /^connect$/i })).toBeDisabled();
	},
};

export const GrantNothing: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("checkbox", { name: /view balance/i }));
		await userEvent.click(canvas.getByRole("checkbox", { name: /view coins/i }));
		await userEvent.click(canvas.getByRole("checkbox", { name: /read public descriptor/i }));
		await userEvent.click(canvas.getByRole("checkbox", { name: /view identity key/i }));

		await userEvent.click(canvas.getByRole("button", { name: /^connect$/i }));

		await expect(args.onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ grantedMethods: [] }),
		);
	},
};

export const GrantSubset: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		expect(canvas.queryByRole("checkbox", { name: /sign/i })).not.toBeInTheDocument();

		await userEvent.click(canvas.getByRole("checkbox", { name: /view coins/i }));
		await userEvent.click(canvas.getByRole("checkbox", { name: /read public descriptor/i }));
		await userEvent.click(canvas.getByRole("checkbox", { name: /view identity key/i }));
		await userEvent.click(canvas.getByRole("button", { name: /^connect$/i }));

		await expect(args.onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ grantedMethods: ["getBalance"] }),
		);
	},
};
