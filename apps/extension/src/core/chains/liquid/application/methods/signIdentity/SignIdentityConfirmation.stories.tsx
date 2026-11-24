import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import {
	SIGN_IDENTITY_CONFIRMATION_KIND,
	SignIdentityConfirmation,
} from "./SignIdentityConfirmation";

const meta = {
	title: "Dapp/SignIdentityConfirmation",
	component: SignIdentityConfirmation,
	args: {
		data: {
			challenge: "5f2e9a0c41d7b3e8a6f0c2d9e1b47a35c8f06d2e9b1a4c7f3e8d05b6a2c9f417",
			fingerprint: "3a9f21c07b5ed184",
			identity: "https://app.lending.example",
			index: 0,
			kind: SIGN_IDENTITY_CONFIRMATION_KIND,
			network: "Liquid Testnet",
		},
		origin: "https://app.lending.example",
		onConfirm: fn(),
		onReject: fn(),
	},
} satisfies Meta<typeof SignIdentityConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BinaryChallenge: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("3a9f 21c0 7b5e d184")).toBeVisible();
		await expect(canvas.getByText(args.data.challenge)).toBeVisible();
	},
};

export const TextChallenge: Story = {
	args: {
		data: {
			challenge: "4c6f6720696e20746f204c656e64696e67",
			fingerprint: "c1d2e3f4a5b6c7d8",
			identity: "ssh://lending@app.lending.example",
			index: 0,
			kind: SIGN_IDENTITY_CONFIRMATION_KIND,
			network: "Liquid Testnet",
			text: "Log in to Lending",
		},
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByText("Log in to Lending")).toBeVisible();
	},
};
