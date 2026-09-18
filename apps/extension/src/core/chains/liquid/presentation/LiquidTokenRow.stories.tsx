import type { Meta, StoryObj } from "@storybook/react-vite";

import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";

import { issuedVerifiedToken, nativeToken } from "./liquidStoryFixtures";
import { LiquidTokenRow } from "./LiquidTokenRow";

const longNameToken: PortfolioViewAsset = {
	...issuedVerifiedToken,
	name: "Wrapped Interest-Bearing Synthetic Liquid Dollar (bridged, v2)",
	symbol: "wibsLUSD",
};

const meta = {
	title: "Chains/Liquid/LiquidTokenRow",
	component: LiquidTokenRow,
	render: (args) => (
		<div className="p-5">
			<div className="flex w-full items-center gap-3 rounded-lg px-1 py-2">
				<LiquidTokenRow {...args} />
			</div>
		</div>
	),
	args: {
		token: nativeToken,
	},
} satisfies Meta<typeof LiquidTokenRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Native: Story = {
	args: { token: nativeToken },
};

export const Issued: Story = {
	args: { token: issuedVerifiedToken },
};

export const LongName: Story = {
	args: { token: longNameToken },
};
