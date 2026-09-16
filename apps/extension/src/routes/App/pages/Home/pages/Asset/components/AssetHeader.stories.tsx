import type { Meta, StoryObj } from "@storybook/react-vite";

import {
	issuedUnverifiedToken,
	issuedVerifiedToken,
	mockLiquidChain,
	nativeToken,
} from "@/core/chains/liquid/presentation/liquidStoryFixtures";

import { AssetHeader } from "./AssetHeader";

const meta = {
	title: "Pages/App/Home/Asset/AssetHeader",
	component: AssetHeader,
	args: { chain: mockLiquidChain, token: nativeToken },
} satisfies Meta<typeof AssetHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Native: Story = {};

export const IssuedVerified: Story = { args: { token: issuedVerifiedToken } };

export const IssuedUnverified: Story = { args: { token: issuedUnverifiedToken } };
