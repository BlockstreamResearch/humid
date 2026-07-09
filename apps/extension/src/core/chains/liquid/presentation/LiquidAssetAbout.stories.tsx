import type { Meta, StoryObj } from "@storybook/react-vite";

import { LiquidAssetAbout } from "./LiquidAssetAbout";
import {
	issuedUnverifiedToken,
	issuedVerifiedToken,
	mockLiquidChain,
	mockLiquidChainNoExplorer,
	nativeToken,
} from "./liquidStoryFixtures";

const meta = {
	title: "Chains/Liquid/LiquidAssetAbout",
	component: LiquidAssetAbout,
	render: (args) => (
		<div className="p-5">
			<LiquidAssetAbout {...args} />
		</div>
	),
	args: {
		chain: mockLiquidChain,
	},
} satisfies Meta<typeof LiquidAssetAbout>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The native policy asset (L-BTC): in-registry, no issuer row. */
export const NativeVerified: Story = {
	args: { token: nativeToken },
};

/** A registry-verified issued asset: the "In registry" badge plus an issuer row. */
export const IssuedVerified: Story = {
	args: { token: issuedVerifiedToken },
};

/** An issued asset absent from the registry: the "Unverified" signal, no issuer row. */
export const IssuedUnverified: Story = {
	args: { token: issuedUnverifiedToken },
};

/** When the chain exposes no explorer URL, the "view on explorer" button is omitted. */
export const NoExplorer: Story = {
	args: { chain: mockLiquidChainNoExplorer, token: issuedVerifiedToken },
};
