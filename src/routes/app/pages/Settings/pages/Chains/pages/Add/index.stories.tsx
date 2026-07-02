import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { createCustomLiquidChainRecord } from "@/core/chains/liquid/chains/createBuiltInLiquidChains";
import type { LiquidChainRecord } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";

import { ChainAddView } from "./components/ChainAddView";

/** Add chain: name + the Liquid group's settings on a fresh custom (regtest) draft. */
function AddChainStory() {
	const [chain, setChain] = useState<LiquidChainRecord>(() =>
		createCustomLiquidChainRecord("My Regtest"),
	);

	return (
		<ChainAddView
			chainTypeLabel="Liquid"
			error={null}
			isSubmitting={false}
			name={chain.name}
			onNameChange={(name) => setChain({ ...chain, name })}
			onSubmit={() => {}}
		>
			<LiquidChainSettings chain={chain} onChange={setChain} />
		</ChainAddView>
	);
}

const meta = {
	title: "Pages/App/Settings/Chains/Add",
	component: AddChainStory,
} satisfies Meta<typeof AddChainStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
