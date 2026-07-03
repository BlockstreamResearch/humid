import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
	WALLET_CAPABILITY_GROUPS,
	type WalletCapabilityDescriptor,
} from "@/core/wallet-methods/capability";

import { DappConnectConfirmation } from "./DappConnectConfirmation";

const capabilities: WalletCapabilityDescriptor[] = [
	{
		access: "read",
		description: "See this account's asset balances.",
		group: WALLET_CAPABILITY_GROUPS.VIEW_BALANCES,
		id: "getBalance",
		label: "View balance",
	},
	{
		access: "read",
		description: "See this account's individual coins (unspent outputs).",
		group: WALLET_CAPABILITY_GROUPS.VIEW_BALANCES,
		id: "getUTXOs",
		label: "View coins",
	},
	{
		access: "read",
		description: "See this account's public addresses (its wallet descriptor).",
		group: WALLET_CAPABILITY_GROUPS.VIEW_ADDRESSES,
		id: "getWalletDescriptor",
		label: "View addresses",
	},
	{
		access: "action",
		description: "Sign arbitrary messages with this account.",
		group: WALLET_CAPABILITY_GROUPS.SIGN_MESSAGES,
		id: "signMessage",
		label: "Sign messages",
	},
	{
		access: "action",
		description: "Sign Liquid transactions (PSETs) for this account.",
		group: WALLET_CAPABILITY_GROUPS.SIGN_TRANSACTIONS,
		id: "signPset",
		label: "Sign transactions",
	},
	{
		access: "action",
		description: "Send assets from this account, with your approval each time.",
		group: WALLET_CAPABILITY_GROUPS.SEND_FUNDS,
		id: "sendTransfer",
		label: "Send funds",
	},
	{
		access: "read",
		description: "See a public key derived from your identity.",
		group: WALLET_CAPABILITY_GROUPS.IDENTITY,
		id: "getIdentityPublicKey",
		label: "View identity key",
	},
	{
		access: "action",
		description: "Sign identity challenges to prove who you are.",
		group: WALLET_CAPABILITY_GROUPS.IDENTITY,
		id: "signIdentity",
		label: "Prove identity",
	},
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
			capabilities,
			chains: ["bip122:1466275836220db2944ca059a3a10ef6"],
			kind: "dappConnect",
			origin: "https://app.example.org",
			requiresUnlock: false,
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DappConnectConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

/** All requested permissions, checked by default; the user reviews and trims. */
export const Default: Story = {};

/** Locked wallet: the connect request opens on an unlock step before the account list. */
export const Locked: Story = {
	args: {
		data: {
			accounts: [],
			capabilities,
			chains: ["bip122:1466275836220db2944ca059a3a10ef6"],
			kind: "dappConnect",
			origin: "https://app.example.org",
			requiresUnlock: true,
		},
	},
};

/** Unchecking "Sign transactions" grants only the remaining capabilities. */
export const GrantSubset: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("checkbox", { name: /sign transactions/i }));
		await userEvent.click(canvas.getByRole("button", { name: /^connect$/i }));

		await expect(args.onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({
				grantedMethods: expect.not.arrayContaining(["signPset"]),
			}),
		);
	},
};
