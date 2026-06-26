import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { AuthCreateProvider } from "../../index";
import { AuthCreateSecretPage } from "./index";

const SAMPLE_SECRET = "9f8c1d4e-2b7a-4c3f-8e1d-6a5b4c3d2e1f-humid-vault-key";

const meta = {
	title: "Pages/Auth/Create/Step 1 Secret",
	component: AuthCreateSecretPage,
	decorators: [
		(Story) => (
			<AuthCreateProvider>
				<Story />
			</AuthCreateProvider>
		),
	],
} satisfies Meta<typeof AuthCreateSecretPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Initial state: empty secret, "Continue" disabled. */
export const Empty: Story = {};

/** Returning to step 1 with a secret already in context — field is prefilled and valid. */
export const Prefilled: Story = {
	decorators: [
		(Story) => (
			<AuthCreateProvider initialSecret={SAMPLE_SECRET}>
				<Story />
			</AuthCreateProvider>
		),
	],
};

/** After pressing "Generate secret" — a random key is filled in locally. */
export const Generated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /generate secret/i }));
		await expect(canvas.getByPlaceholderText("Enter secret manually")).not.toHaveValue("");
	},
};

/** Whitespace-only input fails validation and surfaces the field error. */
export const Invalid: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter secret manually"), "   ");
		await expect(
			await canvas.findByText("Enter a secret manually or generate one."),
		).toBeInTheDocument();
	},
};
