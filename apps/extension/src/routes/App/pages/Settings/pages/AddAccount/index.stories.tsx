import type { Meta, StoryObj } from "@storybook/react-vite";

import { AddAccountView } from "./components/AddAccountView";

const meta = {
	title: "Pages/App/Settings/AddAccount",
	component: AddAccountView,
	args: {
		accountTypeLabel: "Liquid",
		error: null,
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
		error: "Invalid recovery phrase.",
	},
};
