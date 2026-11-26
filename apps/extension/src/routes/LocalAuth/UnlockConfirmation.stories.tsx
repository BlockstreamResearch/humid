import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { UnlockConfirmation } from "./unlockConfirmationRenderer";

const WRONG_PASSWORD = "Wrong password. Try again.";

const meta = {
	title: "Dapp/UnlockConfirmation",
	component: UnlockConfirmation,
	args: { onReject: fn() },
} satisfies Meta<typeof UnlockConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const RevealsPassword: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const password = canvas.getByLabelText<HTMLInputElement>("Password");

		await userEvent.type(password, "super-secret-pass");
		await userEvent.click(canvas.getByRole("button", { name: /show password/i }));
		await expect(password.type).toBe("text");
		await expect(canvas.getByRole("button", { name: /^unlock$/i })).toBeEnabled();
	},
};

export const WrongPassword: Story = {
	parameters: { vault: { behavior: "error", errorMessage: WRONG_PASSWORD } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByLabelText("Password"), "wrong-pass{Enter}");
		await waitFor(() => expect(canvas.getByText(WRONG_PASSWORD)).toBeInTheDocument());
	},
};

export const Rejects: Story = {
	play: async ({ args, canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: /reject/i }));
		await expect(args.onReject).toHaveBeenCalled();
	},
};
