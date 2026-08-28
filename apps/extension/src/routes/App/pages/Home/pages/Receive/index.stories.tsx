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

/** The contract tab once the identity has been read: an address that never changes, and a key. */
export const ContractIdentity: Story = {
	args: {
		...Default.args,
		contractIdentity: {
			address: "tex1qxn3ufc3q78awd8nqqkmyk3sfxwmy4wgcnnrmqz",
			schnorrPublicKey: "8f1a3c5e7b9d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
		},
	},
};

/** The contract tab when the background could not answer. */
export const ContractIdentityFailed: Story = {
	args: {
		...Default.args,
		contractError: "Could not read the contract identity. Try again.",
	},
};
