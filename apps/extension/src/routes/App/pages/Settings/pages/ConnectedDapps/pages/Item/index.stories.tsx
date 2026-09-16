import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { ConnectedDappView } from "@/core/dapp-sessions/model";

import { ConnectedDappItemView } from "./components/ConnectedDappItemView";

const LIQUID_MAINNET = "bip122:1466275836220db2944ca059a3a10ef6";

function ConnectedDappItemStory({ initial }: { initial: ConnectedDappView }) {
	const [dapp, setDapp] = useState<ConnectedDappView>(initial);

	return (
		<ConnectedDappItemView
			accountGroupId="account-group:1"
			accountName="Main account"
			dapp={dapp}
			isRevoking={false}
			onRevoke={() => {}}
			onToggleMethod={(method, silent) =>
				setDapp((current) => ({
					...current,
					methodPolicy: { ...current.methodPolicy, [method]: silent },
				}))
			}
			settingMethod={null}
		/>
	);
}

const meta = {
	title: "Pages/App/Settings/ConnectedDapps/Item",
	component: ConnectedDappItemStory,
} satisfies Meta<typeof ConnectedDappItemStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Injected: Story = {
	args: {
		initial: {
			accountGroupIds: ["account-group:1"],
			chains: [LIQUID_MAINNET],
			connectedAt: 1_700_000_000_000,
			events: ["accountsChanged", "bip122_walletDescriptorChanged"],
			label: "app.example.org",
			methodPolicy: {
				getBalance: true,
				getIdentityPublicKey: false,
				getIdentitySharedKey: false,
				getUTXOs: true,
				getWalletDescriptor: false,
				processConfidentialTransaction: false,
				sendTransfer: false,
				signIdentity: false,
				signMessage: false,
				signPset: false,
			},
			methods: [
				"getBalance",
				"getUTXOs",
				"getWalletDescriptor",
				"getIdentityPublicKey",
				"signPset",
				"sendTransfer",
				"signMessage",
				"signIdentity",
				"getIdentitySharedKey",
				"processConfidentialTransaction",
			],
			sessionId: "dapp-session:1",
			transport: "injected",
			url: "https://app.example.org",
		},
	},
};

export const WalletConnect: Story = {
	args: {
		initial: {
			accountGroupIds: ["account-group:1"],
			chains: [LIQUID_MAINNET],
			events: ["accountsChanged", "chainChanged"],
			iconUrl: undefined,
			label: "WalletConnect Demo",
			methodPolicy: {},
			methods: ["getBalance", "signMessage"],
			topic: "0xtopic",
			transport: "walletconnect",
			url: "https://demo.walletconnect.example",
		},
	},
};
