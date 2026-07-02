import type { ComponentType } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { createCustomLiquidChainRecord } from "@/core/chains/liquid/chains/createBuiltInLiquidChains";
import { LiquidChainCreate } from "@/core/chains/liquid/chains/LiquidChainCreate";
import { LIQUID_CHAIN_GROUP_ID } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";
import { isBuiltInLiquidChainId } from "@/core/chains/liquid/domain/LiquidChain";

type ChainComponent = ComponentType<{ chain: ChainRecord; onChange: (chain: ChainRecord) => void }>;

/**
 * A chain group's popup presentation: its display name, the components the chain group
 * itself implements (Create for adding, Settings for editing), a factory for a fresh
 * custom-chain draft, and a predicate for whether a chain is built-in (non-removable).
 * These are React/runtime values, so they can't cross the RPC boundary — this registry
 * wires each group into the popup bundle.
 */
export type ChainGroupUi = {
	Create: ChainComponent;
	Settings: ChainComponent;
	createDraft: (name: string) => ChainRecord;
	isBuiltIn: (chainId: string) => boolean;
	name: string;
};

export const chainGroupUis: Record<string, ChainGroupUi> = {
	[LIQUID_CHAIN_GROUP_ID]: {
		// The concrete chain is a LiquidChainRecord at runtime (its group id matches).
		Create: LiquidChainCreate as ChainComponent,
		Settings: LiquidChainSettings as ChainComponent,
		createDraft: (name) => createCustomLiquidChainRecord(name),
		isBuiltIn: isBuiltInLiquidChainId,
		name: "Liquid",
	},
};
