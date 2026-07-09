import type { Meta, StoryObj } from "@storybook/react-vite";

import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";

import { issuedVerifiedToken, nativeToken } from "./liquidStoryFixtures";
import { LiquidTokenRow } from "./LiquidTokenRow";

/** A token whose name overflows the row, to exercise the truncation. */
const longNameToken: PortfolioViewAsset = {
	...issuedVerifiedToken,
	name: "Wrapped Interest-Bearing Synthetic Liquid Dollar (bridged, v2)",
	symbol: "wibsLUSD",
};

const meta = {
	title: "Chains/Liquid/LiquidTokenRow",
	component: LiquidTokenRow,
	// The component renders a row's inner cells (a fragment); reproduce the list row that hosts it.
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

/** The native L-BTC row. */
export const Native: Story = {
	args: { token: nativeToken },
};

/** An issued asset row (USDt). */
export const Issued: Story = {
	args: { token: issuedVerifiedToken },
};

/** A long asset name truncates rather than pushing the balance off the row. */
export const LongName: Story = {
	args: { token: longNameToken },
};
