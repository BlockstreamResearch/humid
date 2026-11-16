import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { SendableAsset } from "../model";
import { SendReview } from "./SendReview";

const LBTC: SendableAsset = {
	amount: 152_000_000n,
	decimals: 8,
	isNative: true,
	name: "Liquid Bitcoin",
	rawAssetId: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
	symbol: "L-BTC",
};

const USDT: SendableAsset = {
	amount: 4_200_000_000n,
	decimals: 8,
	isNative: false,
	name: "Tether USD",
	rawAssetId: "b612eb46313a2cd6ebabd8b7a8eed5696e29898b87a43bff41c94f51acef9d73",
	symbol: "USDt",
};

const CONFIDENTIAL =
	"tlq1qqf8er278e6nyvuwtgf39e6ewvdcnjupn9a86rzpx655y5lhkt0walu3djf9cklkxd3ryld97hu8h3xepw7sh2rlu7q45dcew5h3k0vjw29m4x7c8a";

const meta = {
	title: "Pages/App/Home/Send/Review",
	component: SendReview,
	args: {
		account: "Account 0",
		asset: LBTC,
		error: null,
		feeAsset: LBTC,
		isSending: false,
		network: "Liquid Testnet",
		onBack: fn(),
		onConfirm: fn(),
		review: {
			amount: "250000",
			assetId: LBTC.rawAssetId,
			quotes: [
				{ amount: "250000", feeRateSatsPerKvb: 100, feeSats: "26", targetBlocks: 60 },
				{ amount: "250000", feeRateSatsPerKvb: 150, feeSats: "39", targetBlocks: 10 },
				{ amount: "250000", feeRateSatsPerKvb: 200, feeSats: "52", targetBlocks: 1 },
			],
			recipientAddress: CONFIDENTIAL,
			recipientConfidential: true,
		},
	},
} satisfies Meta<typeof SendReview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByRole("heading", { name: "Send 0.0025 L-BTC" })).toBeVisible();
		await expect(canvas.getByText("−0.00250052")).toBeVisible();
		await userEvent.click(canvas.getByRole("radio", { name: /slow/i }));
		await expect(canvas.getByText("−0.00250026")).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: /^send$/i }));
		await expect(args.onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ feeRateSatsPerKvb: 100, feeSats: "26" }),
		);
	},
};

export const TokenToExplicit: Story = {
	args: {
		asset: USDT,
		review: {
			amount: "10000000000",
			assetId: USDT.rawAssetId,
			quotes: [1, 10, 60].map((targetBlocks) => ({
				amount: "10000000000",
				feeRateSatsPerKvb: 100,
				feeSats: "33",
				targetBlocks,
			})),
			recipientAddress: "tex1qjv2q5p8cyl7m3dc5ghwkdw0z3v2rqv3yfm4gz8",
			recipientConfidential: false,
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("Network fee", { selector: "span" })).toBeVisible();
		await expect(canvas.getByRole("note")).toHaveTextContent(/explicit/);
	},
};

export const Failed: Story = {
	args: { error: "The network fee changed. Please review the transfer again." },
};
