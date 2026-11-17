import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { SIGN_PSET_CONFIRMATION_KIND, SignPsetConfirmation } from "./SignPsetConfirmation";

const LBTC = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = `8c2d${"7e".repeat(28)}04ab`;

const meta = {
	title: "Dapp/SignPsetConfirmation",
	component: SignPsetConfirmation,
	args: {
		data: {
			account: "Account 0",
			assets: { [LBTC]: { decimals: 8, ticker: "L-BTC" } },
			broadcast: true,
			kind: SIGN_PSET_CONFIRMATION_KIND,
			network: "Liquid Testnet",
			policyAssetId: LBTC,
			signInputs: [1],
			transaction: {
				fees: [{ amount: "36", asset: LBTC }],
				inputs: [
					{ amount: "250", asset: TOKEN, index: 0, owned: false, sighashType: 1 },
					{ amount: "100036", asset: LBTC, index: 1, owned: true, sighashType: 0x83 },
					{ amount: "2000", asset: LBTC, index: 2, owned: false, sighashType: 1 },
				],
				netEffect: [
					{ amount: "-100036", asset: LBTC },
					{ amount: "250", asset: TOKEN },
				],
				outputs: [
					{
						address: "tlq1qq7mxk2vq0c4n8h3r5s9tfu6wl2y0dzc4e8gj9x2v",
						amount: "250",
						asset: TOKEN,
						index: 0,
						owned: true,
						script: "0014aa",
					},
					{
						address: "tlq1qqd3h5v8nq2p7r0s4w6x9kz3c5f7j2m4n6b8k8w0",
						amount: "100000",
						asset: LBTC,
						index: 1,
						owned: false,
						script: "0014bb",
					},
					{
						address: "tlq1qqf9t2c4v6b8n0m2q4w6e8r0t2y4u6i8o0p2s4d6",
						amount: "2000",
						asset: LBTC,
						index: 2,
						owned: false,
						script: "0014cc",
					},
					{ amount: "36", asset: LBTC, index: 3, owned: false, script: "" },
				],
			},
		},
		origin: "https://app.dex.example",
		onConfirm: fn(),
		onReject: fn(),
	},
} satisfies Meta<typeof SignPsetConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("−0.00100036")).toBeVisible();
		await expect(canvas.getByText("36 sats")).toBeVisible();
		await expect(canvas.getByText(/input 2 covers only that input and output 2/)).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: /sign and send/i }));
		await expect(args.onConfirm).toHaveBeenCalled();
	},
};

export const SignOnly: Story = {
	args: {
		data: {
			...meta.args.data,
			broadcast: false,
			transaction: {
				...meta.args.data.transaction,
				inputs: meta.args.data.transaction.inputs.map((input) => ({ ...input, sighashType: 1 })),
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.queryByText(/covers only that input/)).toBeNull();
		await expect(canvas.getByText(/hands the result back to the dapp/)).toBeVisible();
		await expect(canvas.getByRole("button", { name: /^sign$/i })).toBeVisible();
	},
};
