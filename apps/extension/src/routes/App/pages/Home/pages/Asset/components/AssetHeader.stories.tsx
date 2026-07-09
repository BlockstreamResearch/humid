import type { Meta, StoryObj } from "@storybook/react-vite";

import {
	issuedUnverifiedToken,
	issuedVerifiedToken,
	mockLiquidChain,
	nativeToken,
} from "@/core/chains/liquid/presentation/liquidStoryFixtures";

import { AssetHeader } from "./AssetHeader";

/**
 * The asset page header. Tapping the info icon (right) opens the chain group's "About" panel in a
 * drawer — the About content is chain-specific and looked up via `chainGroupUis`, so this generic
 * route header only offers the trigger. Each story is a different token, so the opened drawer differs.
 */
const meta = {
	title: "Pages/App/Home/Asset/AssetHeader",
	component: AssetHeader,
	args: { chain: mockLiquidChain, token: nativeToken },
} satisfies Meta<typeof AssetHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

/** L-BTC — the info drawer shows a verified, issuer-less asset. */
export const Native: Story = {};

/** A registry-verified issued asset — the info drawer shows its issuer domain. */
export const IssuedVerified: Story = { args: { token: issuedVerifiedToken } };

/** An unverified issued asset — the info drawer flags it as not in the registry. */
export const IssuedUnverified: Story = { args: { token: issuedUnverifiedToken } };
