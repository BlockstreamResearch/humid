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

/** Add account with the create/import toggle (Liquid is the only type for now). */
export const Default: Story = {};

/** The invalid-phrase error surfaced from the backend on import. */
export const ImportError: Story = {
	args: {
		error: "Invalid recovery phrase.",
	},
};
