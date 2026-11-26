import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

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

export const TypedConfirmation: StoryObj<typeof meta> = {
	args: {
		request: {
			title: "Reset wallet?",
			confirmLabel: "Reset",
			confirmPhrase: "RESET",
			message:
				"The funds stay on-chain. Only the recovery phrase can bring the wallet back into this browser.",
			rejectLabel: "Back",
		},
	},
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		const reset = canvas.getByRole("button", { name: "Reset" });

		await expect(canvas.getByRole("button", { name: "Back" })).toBeVisible();
		await expect(reset).toBeDisabled();
		await userEvent.type(canvas.getByRole("textbox"), "reset");
		await expect(reset).toBeDisabled();
		await userEvent.clear(canvas.getByRole("textbox"));
		await userEvent.type(canvas.getByRole("textbox"), "RESET");
		await userEvent.click(reset);
		await expect(args.onConfirm).toHaveBeenCalled();
	},
};
