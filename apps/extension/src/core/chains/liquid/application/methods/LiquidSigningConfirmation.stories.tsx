import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { LiquidSigningConfirmation } from "./LiquidSigningConfirmation";

const account = { accountIdentifier: "liquid:testnet account 0", chainId: "liquid:testnet" };
const requester = { name: "Example Exchange", origin: "https://exchange.example.org" };
const asset = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const messageRequest = {
	title: "Sign Liquid message?",
	message: "A dapp wants to sign a Liquid message.",
	method: "signMessage",
	requester,
	data: {
		...account,
		address: "tex1qexampleaccountaddress",
		kind: "liquid.signMessage",
		message: "Sign in to Example Exchange\nNonce: 184725\nExpires: 2026-10-02T12:00:00Z",
		protocol: "ecdsa",
	},
};

const meta = {
	title: "Dapp/SigningConfirmation",
	component: LiquidSigningConfirmation,
	args: { request: messageRequest, onConfirm: fn(), onDecline: fn() },
} satisfies Meta<typeof LiquidSigningConfirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Message: Story = {};

export const Identity: Story = {
	args: {
		request: {
			title: "Sign Liquid identity challenge?",
			method: "signIdentity",
			requester,
			data: {
				chainId: account.chainId,
				challenge: "5369676e20696e20746f204578616d706c652045786368616e6765",
				challengeFingerprint: "9787c3b7c212eb4b8173ff36c41e511f",
				curve: "nist256p1",
				identity: "https://exchange.example.org/login",
				index: 0,
				kind: "liquid.signIdentity",
			},
		},
	},
};

export const Pset: Story = {
	args: {
		request: {
			title: "Sign Liquid PSET?",
			method: "signPset",
			requester,
			data: {
				...account,
				broadcast: false,
				kind: "liquid.signPset",
				requestedInputs: [{ address: "tex1qexampleaccountaddress", index: 0, sighashTypes: [1] }],
				transaction: {
					pset: "cHNldP8BAgQCAAAAAQMEAAAAAAEEAQEBBQEAAQYBAAH7BAIAAAAA",
					inputs: [{ index: 0, sighashType: 130 }],
					fees: [{ asset, amount: "344" }],
					netEffect: [{ asset, amount: "-50344" }],
					outputs: [
						{
							index: 0,
							address: "tex1qexamplerecipientaddress",
							asset,
							amount: "50000",
							script: `0014${"33".repeat(20)}`,
						},
						{ index: 1, asset, amount: "344", script: "" },
						{ index: 2, script: `0014${"44".repeat(20)}` },
					],
				},
			},
		},
	},
};

export const Transfer: Story = {
	args: {
		request: {
			title: "Send Liquid transfer?",
			method: "sendTransfer",
			requester,
			data: {
				...account,
				amount: "50000",
				assetId: `liquid:testnet/elip144:${asset}`,
				kind: "liquid.sendTransfer",
				memo: "Order 184725",
				recipientAddress: "tex1qexamplerecipientaddress",
				recipientConfidential: false,
			},
		},
	},
};

export const Unreadable: Story = {
	args: { request: { ...messageRequest, data: { kind: "liquid.signMessage" } } },
};
