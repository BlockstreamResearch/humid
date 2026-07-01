import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";

import { SettingsRootView } from "./components/SettingsRootView";

const ACCOUNTS: AccountGroupRecord[] = [
	{
		chainAccountIds: [],
		createdAt: 0,
		id: "account-group:1",
		kind: "multichain",
		name: "Account 1",
		updatedAt: 0,
		walletId: "wallet:1",
	},
	{
		chainAccountIds: [],
		createdAt: 0,
		id: "account-group:2",
		kind: "multichain",
		name: "Trading",
		updatedAt: 0,
		walletId: "wallet:1",
	},
	{
		chainAccountIds: [],
		createdAt: 0,
		id: "account-group:3",
		kind: "multichain",
		name: "Cold storage",
		updatedAt: 0,
		walletId: "wallet:2",
	},
];

const meta = {
	title: "Pages/App/Settings/Root",
	component: SettingsRootView,
	args: {
		accountGroups: ACCOUNTS,
		isLocking: false,
		onLock: () => {},
		onSwitch: () => {},
		selectedAccountGroupId: "account-group:1",
	},
} satisfies Meta<typeof SettingsRootView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Settings landing with a few mock accounts (the first is selected). */
export const Default: Story = {};
