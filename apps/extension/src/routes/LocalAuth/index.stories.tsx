import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ConfirmProvider } from "@/common/Confirmation";

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

export const Empty: Story = {};

export const Filled: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter passphrase"), "super-secret-pass");
		await expect(canvas.getByRole("button", { name: /^unlock$/i })).toBeEnabled();
	},
};

export const Unlocking: Story = {
	parameters: { vault: { behavior: "pending" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter passphrase"), "super-secret-pass");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await expect(await canvas.findByRole("button", { name: /unlocking/i })).toBeDisabled();
	},
};

export const UnlockError: Story = {
	parameters: { vault: { behavior: "error", errorMessage: UNLOCK_ERROR } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter passphrase"), "wrong-pass");
		await userEvent.click(canvas.getByRole("button", { name: /^unlock$/i }));
		await waitFor(() => expect(canvas.getByText(UNLOCK_ERROR)).toBeInTheDocument());
	},
};

export const ResetCancelled: Story = {
	parameters: {
		vault: { behavior: "success", status: { hasVault: true, isUnlocked: false } },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await userEvent.click(canvas.getByRole("button", { name: /reset local wallet/i }));
		await userEvent.click(documentBody.getByRole("button", { name: /^decline$/i }));
		await waitFor(() =>
			expect(
				canvas.getByText("Reset cancelled. Your encrypted wallet is still on this device."),
			).toBeInTheDocument(),
		);
	},
};
