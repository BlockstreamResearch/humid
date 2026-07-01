import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import { ChainListView } from "./components/ChainListView";

const LIQUID_CHAINS: ChainRecord[] = [
	{
		chainGroupId: "liquid",
		id: "bip122:1466275836220db2944ca059a3a10ef6",
		name: "Liquid",
		settings: {},
	},
	{
		chainGroupId: "liquid",
		id: "bip122:a771da8e52ee6ad581ed1e9a99825e5b",
		name: "Liquid Testnet",
		settings: {},
	},
];

const meta = {
	title: "Pages/App/Settings/Chains/List",
	component: ChainListView,
	args: {
		groups: [{ chains: LIQUID_CHAINS, id: "liquid", name: "Liquid" }],
	},
} satisfies Meta<typeof ChainListView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The chains list: chain groups with their chains. */
export const Default: Story = {};
