import type { Meta, StoryObj } from "@storybook/react-vite";

import { LiquidTxStatusBadge } from "./LiquidTxStatus";

const meta = {
	title: "Chains/Liquid/LiquidTxStatusBadge",
	component: LiquidTxStatusBadge,
	render: (args) => (
		<div className="flex size-full items-center justify-center p-5">
			<LiquidTxStatusBadge {...args} />
		</div>
	),
	args: {
		status: "confirmed",
	},
	argTypes: {
		status: {
			control: "inline-radio",
			options: ["pending", "confirmed"],
		},
	},
} satisfies Meta<typeof LiquidTxStatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Still settling on-chain: a pulsing amber dot. */
export const Pending: Story = {
	args: { status: "pending" },
};

/** Confirmed on-chain: an emerald checkmark. */
export const Confirmed: Story = {
	args: { status: "confirmed" },
};
