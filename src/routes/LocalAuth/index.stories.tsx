import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ConfirmProvider } from "@/common/ConfirmationPopup";

import { LocalAuthPage } from "./index";

const UNLOCK_ERROR = "Incorrect password. Please try again.";

const meta = {
	title: "Pages/LocalAuth",
	component: LocalAuthPage,
	decorators: [
		(Story) => (
			<ConfirmProvider>
				<Story />
			</ConfirmProvider>
		),
	],
} satisfies Meta<typeof LocalAuthPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Locked vault, waiting for the password. */
export const Empty: Story = {};

/** Password entered — ready to unlock. */
export const Filled: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter passphrase"), "super-secret-pass");
		await expect(canvas.getByRole("button", { name: /^unlock$/i })).toBeEnabled();
	},
};

/** Unlocking is in flight. */
export const Unlocking: Story = {
	parameters: { vault: { behavior: "pending" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter passphrase"), "super-secret-pass");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await expect(await canvas.findByRole("button", { name: /unlocking/i })).toBeDisabled();
	},
};

/** Wrong password — unlock fails with an inline error. */
export const UnlockError: Story = {
	parameters: { vault: { behavior: "error", errorMessage: UNLOCK_ERROR } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter passphrase"), "wrong-pass");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await waitFor(() => expect(canvas.getByText(UNLOCK_ERROR)).toBeInTheDocument());
	},
};

/** Reset request returns a still-existing vault — the cancellation notice is shown. */
export const ResetCancelled: Story = {
	parameters: {
		vault: { behavior: "success", status: { hasVault: true, isUnlocked: false } },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await userEvent.click(canvas.getByRole("button", { name: /reset local vault/i }));
		await userEvent.click(documentBody.getByRole("button", { name: /^decline$/i }));
		await waitFor(() =>
			expect(
				canvas.getByText("Reset cancelled. Your encrypted vault is still on this device."),
			).toBeInTheDocument(),
		);
	},
};
