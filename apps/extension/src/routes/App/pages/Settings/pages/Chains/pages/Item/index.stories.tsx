import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { LiquidChainRecord } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";

import { ChainItemView } from "./components/ChainItemView";

/** The per-chain shell wrapping the Liquid chain's own settings (network, backend, explorer). */
function LiquidChainStory({ initial }: { initial: LiquidChainRecord }) {
	const [chain, setChain] = useState<LiquidChainRecord>(initial);
	const removable = chain.settings.network === "regtest";

	return (
		<ChainItemView
			chainName={chain.name}
			isRemoving={false}
			isSaving={false}
			onRemove={removable ? () => {} : undefined}
			onSave={() => {}}
		>
			<LiquidChainSettings chain={chain} onChange={setChain} />
		</ChainItemView>
	);
}

const meta = {
	title: "Pages/App/Settings/Chains/Item",
	component: LiquidChainStory,
} satisfies Meta<typeof LiquidChainStory>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A built-in chain: network Liquid, Esplora backend, explorer URL. */
export const Liquid: Story = {
	args: {
		initial: {
			chainGroupId: "liquid",
			id: "bip122:1466275836220db2944ca059a3a10ef6",
			name: "Liquid",
			settings: {
				network: "mainnet",
				backend: { url: "https://blockstream.info/liquid/api" },
				explorerUrl: "https://blockstream.info/liquid/",
			},
		},
	},
};

/** A custom (regtest) chain with an authenticated backend: the policy-asset and header fields. */
export const Regtest: Story = {
	args: {
		initial: {
			chainGroupId: "liquid",
			id: "bip122:00902a6b70c2ca83b5d9c815d96a0e2f",
			name: "Local Regtest",
			settings: {
				network: "regtest",
				policyAsset: "5ac9f65c0efcc4775e0baec4ec03abdde22473cd3cf33c0419ca290e0751b225",
				backend: {
					url: "127.0.0.1:3000",
					headers: [{ name: "x-api-key", value: "dev-secret" }],
				},
			},
		},
	},
};

/** A Waterfalls backend with the advanced knobs (utxo-only, timeout, concurrency) set. */
export const Waterfalls: Story = {
	args: {
		initial: {
			chainGroupId: "liquid",
			id: "bip122:a771da8e52ee6ad581ed1e9a99825e5b",
			name: "Liquid Testnet",
			settings: {
				network: "testnet",
				backend: {
					url: "https://waterfalls.liquidwebwallet.org/liquidtestnet/api",
					waterfalls: true,
					utxoOnly: true,
					timeout: 30,
					concurrency: 4,
				},
				explorerUrl: "https://blockstream.info/liquidtestnet/",
			},
		},
	},
};
