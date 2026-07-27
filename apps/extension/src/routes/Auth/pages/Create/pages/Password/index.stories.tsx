import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

import { AuthCreateProvider } from "../../index";
import { AuthCreatePasswordPage } from "./index";

const SAMPLE_SEED_MATERIAL = "9f8c1d4e-2b7a-4c3f-8e1d-6a5b4c3d2e1f-humid-root-key";
const CREATE_ERROR = "Could not create the vault. Please try again.";

async function fillPasswords(canvasElement: HTMLElement, password: string, confirm: string) {
	const canvas = within(canvasElement);

	await userEvent.type(canvas.getByPlaceholderText("Create password"), password);
	await userEvent.type(canvas.getByPlaceholderText("Repeat password"), confirm);
}

const meta = {
	title: "Pages/Auth/Create/Step 2 Password",
	component: AuthCreatePasswordPage,
	// Root material must already exist in context, otherwise the page redirects back to step 1.
	decorators: [
		(Story) => (
			<AuthCreateProvider initialSeedMaterial={SAMPLE_SEED_MATERIAL}>
				<UiPageBackgroundWrp>
					<Story />
				</UiPageBackgroundWrp>
			</AuthCreateProvider>
		),
	],
} satisfies Meta<typeof AuthCreatePasswordPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Initial state: empty form, "Create vault" disabled. */
export const Empty: Story = {};

/** Both fields match and meet the length requirement — submit is enabled. */
export const Valid: Story = {
	play: async ({ canvasElement }) => {
		await fillPasswords(canvasElement, "super-secret-pass", "super-secret-pass");

		const canvas = within(canvasElement);
		await expect(canvas.getByRole("button", { name: /create wallet/i })).toBeEnabled();
	},
};

/** Confirmation does not match the password. */
export const Mismatch: Story = {
	play: async ({ canvasElement }) => {
		await fillPasswords(canvasElement, "super-secret-pass", "different-pass");

		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Passwords do not match.")).toBeInTheDocument();
	},
};

/** Password shorter than the 8-character minimum. */
export const TooShort: Story = {
	play: async ({ canvasElement }) => {
		await fillPasswords(canvasElement, "short", "short");

		const canvas = within(canvasElement);
		await expect(
			await canvas.findByText("Password must be at least 8 characters."),
		).toBeInTheDocument();
	},
};

/** Submission in flight — the vault request never resolves. */
export const Submitting: Story = {
	parameters: { vault: { behavior: "pending" } },
	play: async ({ canvasElement }) => {
		await fillPasswords(canvasElement, "super-secret-pass", "super-secret-pass");

		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /create wallet/i }));
		await expect(await canvas.findByRole("button", { name: /creating/i })).toBeDisabled();
	},
};

/** The vault request fails and the error is shown. */
export const SubmitError: Story = {
	parameters: { vault: { behavior: "error", errorMessage: CREATE_ERROR } },
	play: async ({ canvasElement }) => {
		await fillPasswords(canvasElement, "super-secret-pass", "super-secret-pass");

		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /create wallet/i }));
		await waitFor(() => expect(canvas.getByText(CREATE_ERROR)).toBeInTheDocument());
	},
};
