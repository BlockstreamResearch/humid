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

/** Per-account settings with rename + remove + forget-wallet actions available. */
export const Default: Story = {};

/** The wallet is the only one, so "Forget wallet" is hidden — you cannot forget your last wallet. */
export const OnlyWallet: Story = {
	args: { canForgetWallet: false },
};
