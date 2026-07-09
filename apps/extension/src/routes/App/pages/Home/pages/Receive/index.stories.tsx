import type { Meta, StoryObj } from "@storybook/react-vite";

import { ReceiveView } from "./components/ReceiveView";

const meta = {
	title: "Pages/App/Home/Receive",
	component: ReceiveView,
} satisfies Meta<typeof ReceiveView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Receive screen with a stub Liquid address + QR. */
export const Default: Story = {
	args: {
		accountName: "Account 1",
		address: "lq1qqwvvfj8m7s5k3n2p9x4d6h0tzq8r7l5c3v1b9n8m6k4j2h0g8f6d4s2a0qw8xk2",
		chainName: "Liquid",
	},
};
