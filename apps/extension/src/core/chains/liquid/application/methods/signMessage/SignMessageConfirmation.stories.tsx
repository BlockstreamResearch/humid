import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { SIGN_MESSAGE_CONFIRMATION_KIND, SignMessageConfirmation } from "./SignMessageConfirmation";

const meta = {
	title: "Dapp/SignMessageConfirmation",
	component: SignMessageConfirmation,
	args: {
		data: {
			address:
				"tlq1qq2xvpcvfup5j8zscjq05u2wxxjcyewk7979f3mmz5l7uw5pqmx6xf5xy50hsn6vhkm5euwt72x878eq6zxx2z58hd7zrsg9qn",
			kind: SIGN_MESSAGE_CONFIRMATION_KIND,
			message: "Sign in to Lending.\nNonce: 8f3a91c2\nIssued: 2026-11-15 10:42 UTC",
			network: "Liquid Testnet",
			protocol: "ecdsa",
		},
		origin: "https://app.lending.example",
		onConfirm: fn(),
		onReject: fn(),
	},
} satisfies Meta<typeof SignMessageConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText(/Nonce: 8f3a91c2/)).toBeVisible();
		await expect(canvas.getByText(args.data.address)).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: /^sign$/i }));
		await expect(args.onConfirm).toHaveBeenCalled();
	},
};

export const LongMessage: Story = {
	args: {
		data: {
			address:
				"tlq1qq2xvpcvfup5j8zscjq05u2wxxjcyewk7979f3mmz5l7uw5pqmx6xf5xy50hsn6vhkm5euwt72x878eq6zxx2z58hd7zrsg9qn",
			kind: SIGN_MESSAGE_CONFIRMATION_KIND,
			message: Array.from({ length: 30 }, (_, line) => `Line ${line + 1} of the terms.`).join("\n"),
			network: "Liquid Testnet",
			protocol: "ecdsa",
		},
	},
};
