import type { Meta, StoryObj } from "@storybook/react-vite";

import { AccountDetailView } from "./components/AccountDetailView";

const meta = {
	title: "Pages/App/Settings/Account",
	component: AccountDetailView,
	args: {
		accountGroupId: "account-group:1",
		accountName: "Account 1",
		canForgetWallet: true,
		forgetError: null,
		isForgetting: false,
		isRemoving: false,
		onForgetWallet: () => {},
		onRemove: () => {},
		onRename: () => {},
		removeError: null,
	},
} satisfies Meta<typeof AccountDetailView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnlyWallet: Story = {
	args: { canForgetWallet: false },
};
