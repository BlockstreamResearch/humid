import type { Meta, StoryObj } from "@storybook/react-vite";

import { LIQUID_CHAIN_GROUP_ID } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { chainGroupUis } from "@/routes/App/chainGroupUis";

import { ChainAddForm } from "../../components/ChainAddForm";

/** Add chain: the common form with the Liquid group's Create body (network kind + settings). */
function AddChainStory() {
	const groupUi = chainGroupUis[LIQUID_CHAIN_GROUP_ID];

	if (!groupUi) return null;

	return <ChainAddForm error={null} groupUi={groupUi} isSubmitting={false} onSubmit={() => {}} />;
}

const meta = {
	title: "Pages/App/Settings/Chains/Add",
	component: AddChainStory,
} satisfies Meta<typeof AddChainStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
