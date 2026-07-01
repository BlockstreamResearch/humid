import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { LiquidChainRecord } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";

import { ChainItemView } from "./components/ChainItemView";

/** The per-chain shell wrapping the Liquid chain's own settings (Esplora / Waterfalls). */
function LiquidChainStory() {
	const [chain, setChain] = useState<LiquidChainRecord>({
		chainGroupId: "liquid",
		id: "bip122:1466275836220db2944ca059a3a10ef6",
		name: "Liquid",
		settings: { backend: { kind: "esplora", url: "https://blockstream.info/liquid/api" } },
	});

	return (
		<ChainItemView chainName={chain.name} isSaving={false} onSave={() => {}}>
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

export const Liquid: Story = {};
