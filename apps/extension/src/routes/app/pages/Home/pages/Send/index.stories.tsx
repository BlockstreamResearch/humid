import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { SendForm } from "./components/SendForm";
import type { SendableAsset } from "./model";

const LBTC: SendableAsset = {
	amount: 152_000_000n,
	decimals: 8,
	isNative: true,
	name: "Liquid Bitcoin",
	rawAssetId: "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d",
	symbol: "L-BTC",
};

const USDT: SendableAsset = {
	amount: 4_200_000n,
	decimals: 8,
	isNative: false,
	name: "Tether USD",
	rawAssetId: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2",
	symbol: "USDt",
};

const meta = {
	title: "Pages/App/Home/Send",
	component: SendForm,
	args: {
		amount: "",
		assets: [LBTC, USDT],
		canContinue: false,
		error: null,
		isPreparing: false,
		onAmountChange: fn(),
		onContinue: fn(),
		onRecipientChange: fn(),
		onSelectAsset: fn(),
		recipient: "",
		selectedAsset: LBTC,
	},
} satisfies Meta<typeof SendForm>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Empty form — Continue stays disabled until a recipient and a positive amount are entered. */
export const Default: Story = {};

/** A filled-in transfer, ready to preview. */
export const Filled: Story = {
	args: {
		amount: "0.5",
		canContinue: true,
		recipient: "lq1qqw8xk2m7s5k3n2p9x4d6h0tzq8r7l5c3v1b9n8m6k4j2h0g8f6d4s2a0qw8xk2",
	},
};

/** Single held asset — the picker collapses to a static row (the L-BTC-only case). */
export const SingleAsset: Story = {
	args: {
		assets: [LBTC],
	},
};
