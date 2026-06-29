import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ConfirmProvider } from "@/common/ConfirmationPopup";

import { AppHomePage } from "./index";

const LOCK_ERROR = "Could not lock the vault. Please try again.";

const meta = {
	title: "Pages/App/Home",
	component: AppHomePage,
	decorators: [
		(Story) => (
			<ConfirmProvider>
				<Story />
			</ConfirmProvider>
		),
	],
} satisfies Meta<typeof AppHomePage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Authorized home screen. */
export const Default: Story = {};

/** Locking failed — the error message is rendered. */
export const LockError: Story = {
	parameters: { vault: { behavior: "error", errorMessage: LOCK_ERROR } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /^lock$/i }));
		await waitFor(() => expect(canvas.getByText(LOCK_ERROR)).toBeInTheDocument());
	},
};

/** Reset returns a still-active vault — the cancellation notice is shown. */
export const ResetCancelled: Story = {
	parameters: {
		vault: { behavior: "success", status: { hasVault: true, isUnlocked: true } },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await userEvent.click(canvas.getByRole("button", { name: /^reset$/i }));
		await userEvent.click(documentBody.getByRole("button", { name: /^decline$/i }));
		await waitFor(() =>
			expect(
				canvas.getByText("Reset cancelled. Your encrypted vault is still active."),
			).toBeInTheDocument(),
		);
	},
};
