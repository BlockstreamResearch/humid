import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { DefaultConfirmation } from "./DefaultConfirmation";

const meta = {
	title: "Confirmation/DefaultConfirmation",
	component: DefaultConfirmation,
	args: {
		request: {
			title: "Sign Liquid PSET?",
			confirmLabel: "Sign",
			message: "Return the signed PSET to the dapp; do not broadcast.",
			requester: { origin: "https://app.lending.example" },
		},
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof DefaultConfirmation>;

export default meta;

export const GenericRequest: StoryObj<typeof meta> = {};
