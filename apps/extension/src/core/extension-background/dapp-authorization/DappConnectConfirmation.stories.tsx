import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { DappConnectConfirmation } from "./DappConnectConfirmation";

// The session's whole authorized surface, as the background hands it to the modal: every method
// here is callable once connected. Only the reads the modal knows about become checkboxes; the
// signing/sending ones are offered but always confirm, so they get no checkbox.
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
			chains: ["bip122:1466275836220db2944ca059a3a10ef6"],
			kind: "dappConnect",
			methods,
			origin: "https://app.example.org",
			requiresUnlock: false,
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DappConnectConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every permission starts unticked: the user opts in to what may run without asking. */
export const Default: Story = {};

/** Locked wallet: the connect request opens on an unlock step before the account list. */
export const Locked: Story = {
	args: {
		data: {
			accounts: [],
			chains: ["bip122:1466275836220db2944ca059a3a10ef6"],
			kind: "dappConnect",
			methods,
			origin: "https://app.example.org",
			requiresUnlock: true,
		},
	},
};

/** Connecting without ticking anything pre-approves nothing — every call will confirm. */
export const GrantNothing: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /^connect$/i }));

		await expect(args.onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ grantedMethods: [] }),
		);
	},
};

/**
 * Ticking "View balance" pre-approves exactly that method. The session also offers signPset, but
 * an always-confirm method has no checkbox, so it can never reach the granted set.
 */
export const GrantSubset: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		expect(canvas.queryByRole("checkbox", { name: /sign/i })).not.toBeInTheDocument();

		await userEvent.click(canvas.getByRole("checkbox", { name: /view balance/i }));
		await userEvent.click(canvas.getByRole("button", { name: /^connect$/i }));

		await expect(args.onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ grantedMethods: ["getBalance"] }),
		);
	},
};
