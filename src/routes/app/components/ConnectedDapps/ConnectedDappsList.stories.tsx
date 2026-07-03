import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ConnectedDappView } from "@/core/dapp-sessions/model";

import { ConnectedDappsList } from "./ConnectedDappsList";

const LIQUID_MAINNET = "bip122:1466275836220db2944ca059a3a10ef6";

const DAPPS: ConnectedDappView[] = [
	{
		accountGroupIds: ["account-group:1"],
		chains: [LIQUID_MAINNET],
		connectedAt: 1_700_000_000_000,
		events: ["accountsChanged", "wallet_sessionChanged"],
		label: "app.example.org",
		methods: ["getBalance", "getWalletDescriptor", "signMessage", "signPset"],
		sessionId: "dapp-session:1",
		transport: "injected",
		url: "https://app.example.org",
	},
	{
		accountGroupIds: ["account-group:1"],
		chains: [LIQUID_MAINNET],
		events: ["accountsChanged", "chainChanged"],
		label: "WalletConnect Demo",
		methods: ["getBalance"],
		topic: "0xtopic",
		transport: "walletconnect",
		url: "https://demo.walletconnect.example",
	},
];

const meta = {
	title: "Components/App/ConnectedDappsList",
	component: ConnectedDappsList,
	args: {
		dapps: DAPPS,
		isError: false,
		isLoading: false,
		onRevoke: () => {},
		revokingKey: null,
	},
	decorators: [
		(Story) => (
			<div className="border-border w-80 rounded-lg border p-1">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ConnectedDappsList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** An injected dapp and a WalletConnect dapp connected to the account. */
export const Populated: Story = {};

/** No dapps connected yet. */
export const Empty: Story = { args: { dapps: [] } };

/** Initial load. */
export const Loading: Story = { args: { isLoading: true } };

/** The backend read failed. */
export const Failed: Story = { args: { isError: true } };

/** The injected dapp mid-disconnect. */
export const Revoking: Story = { args: { revokingKey: "dapp-session:1" } };
