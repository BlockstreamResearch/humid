import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

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
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText(issuedUnverifiedToken.id)).toBeVisible();
		await expect(canvas.getByText("Unknown, amounts in raw units")).toBeVisible();
	},
};

export const NoExplorer: Story = {
	args: { chain: mockLiquidChainNoExplorer, token: issuedVerifiedToken },
};
