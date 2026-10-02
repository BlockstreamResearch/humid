import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { WalletUnlockConfirmation } from "./WalletUnlockConfirmation";

const meta = {
	title: "Dapp/WalletUnlockConfirmation",
	component: WalletUnlockConfirmation,
	args: {
		data: { kind: "wallet-unlock", origin: "https://app.example.org" },
		onConfirm: fn(),
		onDecline: fn(),
	},
} satisfies Meta<typeof WalletUnlockConfirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unlock: Story = {
	parameters: { vault: { behavior: "success", status: { hasVault: true, isUnlocked: true } } },
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByLabelText("Password"), "correct-password");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await expect(args.onConfirm).toHaveBeenCalled();
	},
};

export const WrongPassword: Story = {
	parameters: {
		vault: { behavior: "error", errorMessage: "Incorrect password. Please try again." },
	},
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByLabelText("Password"), "wrong-password");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await expect(await canvas.findByRole("alert")).toHaveTextContent(
			"Incorrect password. Please try again.",
		);
		await expect(args.onConfirm).not.toHaveBeenCalled();
		await expect(args.onDecline).not.toHaveBeenCalled();
		const password = canvas.getByLabelText<HTMLInputElement>("Password");
		await waitFor(() => expect(password).toHaveFocus());
		await expect(password.selectionStart).toBe(0);
		await expect(password.selectionEnd).toBe(password.value.length);
		await userEvent.type(password, "replacement");
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
		await expect(args.onConfirm).not.toHaveBeenCalled();
	},
};

export const StillLocked: Story = {
	parameters: {
		vault: { behavior: "success", status: { hasVault: true, isUnlocked: false } },
	},
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByLabelText("Password"), "password");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await expect(await canvas.findByRole("alert")).toHaveTextContent(
			"Could not unlock the wallet.",
		);
		await expect(args.onConfirm).not.toHaveBeenCalled();
		await expect(args.onDecline).not.toHaveBeenCalled();
	},
};

export const Decline: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /^cancel$/i }));
		await expect(args.onDecline).toHaveBeenCalledOnce();
		await expect(args.onConfirm).not.toHaveBeenCalled();
	},
};
