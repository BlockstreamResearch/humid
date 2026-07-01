import type { Meta, StoryObj } from "@storybook/react-vite";

import { AccountDetailView } from "./components/AccountDetailView";

const meta = {
	title: "Pages/App/Settings/Account",
	component: AccountDetailView,
	args: {
		accountGroupId: "account-group:1",
		accountName: "Account 1",
		onRename: () => {},
	},
} satisfies Meta<typeof AccountDetailView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Per-account settings with the rename dialog available and the rest pending. */
export const Default: Story = {};
