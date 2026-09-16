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

export const NativeVerified: Story = {
	args: { token: nativeToken },
};

export const IssuedVerified: Story = {
	args: { token: issuedVerifiedToken },
};

export const IssuedUnverified: Story = {
	args: { token: issuedUnverifiedToken },
};

export const NoExplorer: Story = {
	args: { chain: mockLiquidChainNoExplorer, token: issuedVerifiedToken },
};
