import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { AuthCreateProvider } from "../../index";
import { AuthCreateSecretPage } from "./index";

const SAMPLE_SEED_MATERIAL = "9f8c1d4e-2b7a-4c3f-8e1d-6a5b4c3d2e1f-humid-root-key";

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

/** Initial state: empty root material, "Continue" disabled. */
export const Empty: Story = {};

/** Returning to step 1 with root material already in context — field is prefilled and valid. */
export const Prefilled: Story = {
	decorators: [
		(Story) => (
			<AuthCreateProvider initialSeedMaterial={SAMPLE_SEED_MATERIAL}>
				<Story />
			</AuthCreateProvider>
		),
	],
};

/** After pressing "Generate root material" — random root material is filled in locally. */
export const Generated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("button", { name: /generate root material/i }));
		await expect(canvas.getByPlaceholderText("Enter seed material manually")).not.toHaveValue("");
	},
};

/** Whitespace-only input fails validation and surfaces the field error. */
export const Invalid: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(canvas.getByPlaceholderText("Enter seed material manually"), "   ");
		await expect(
			await canvas.findByText("Enter seed material manually or generate it."),
		).toBeInTheDocument();
	},
};
