import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ConnectedDappView } from "@/core/dapp-sessions/model";

import { ConnectedDappsListView } from "./components/ConnectedDappsListView";

const LIQUID_MAINNET = "bip122:1466275836220db2944ca059a3a10ef6";

const DAPPS: ConnectedDappView[] = [
	{
		accountGroupIds: ["account-group:1"],
		chains: [LIQUID_MAINNET],
		connectedAt: 1_700_000_000_000,
		events: ["accountsChanged", "bip122_walletDescriptorChanged"],
		label: "app.example.org",
		methodPolicy: {
			getBalance: true,
			getWalletDescriptor: false,
			signMessage: false,
			signPset: false,
		},
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
		methodPolicy: {},
		methods: ["getBalance"],
		topic: "0xtopic",
		transport: "walletconnect",
		url: "https://demo.walletconnect.example",
	},
];

const meta = {
	title: "Pages/App/Settings/ConnectedDapps/List",
	component: ConnectedDappsListView,
	args: {
		accountGroupId: "account-group:1",
		accountName: "Main account",
		dapps: DAPPS,
		isError: false,
		isLoading: false,
	},
} satisfies Meta<typeof ConnectedDappsListView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** An injected dapp and a WalletConnect dapp, each drilling into its per-method policy. */
export const Populated: Story = {};

/** No dapps connected yet. */
export const Empty: Story = { args: { dapps: [] } };

/** Initial load. */
export const Loading: Story = { args: { isLoading: true } };

/** The backend read failed. */
export const Failed: Story = { args: { isError: true } };
