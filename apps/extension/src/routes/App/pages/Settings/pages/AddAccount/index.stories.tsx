import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { AddAccountView } from "./components/AddAccountView";

const meta = {
	title: "Pages/App/Settings/AddAccount",
	component: AddAccountView,
	args: {
		accountTypeLabel: "Liquid",
		errors: { create: null, import: null },
		isSubmitting: false,
		onCreate: () => {},
		onImport: () => {},
	},
} satisfies Meta<typeof AddAccountView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ImportError: Story = {
	args: {
		errors: { create: null, import: "Enter a valid 12-word recovery phrase." },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		expect(canvas.queryByText(/valid 12-word/)).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Import" }));
		await expect(canvas.getByText("Enter a valid 12-word recovery phrase.")).toBeVisible();
	},
};
