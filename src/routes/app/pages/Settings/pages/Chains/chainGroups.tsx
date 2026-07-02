import type { ComponentType } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { createCustomLiquidChainRecord } from "@/core/chains/liquid/chains/createBuiltInLiquidChains";
import { LIQUID_CHAIN_GROUP_ID } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";
import { isBuiltInLiquidChainId } from "@/core/chains/liquid/domain/LiquidChain";

/**
 * A chain group's popup presentation: its display name, the settings component the chain
 * group itself implements, a factory for a fresh custom-chain draft, and a predicate for
 * whether a chain is built-in (non-removable). These are React/runtime values, so they
 * can't cross the RPC boundary — this registry wires each group into the popup bundle.
 */
export type ChainGroupUi = {
	Settings: ComponentType<{ chain: ChainRecord; onChange: (chain: ChainRecord) => void }>;
	createDraft: (name: string) => ChainRecord;
	isBuiltIn: (chainId: string) => boolean;
	name: string;
};

export const chainGroupUis: Record<string, ChainGroupUi> = {
	[LIQUID_CHAIN_GROUP_ID]: {
		// The concrete chain is a LiquidChainRecord at runtime (its group id matches).
		Settings: LiquidChainSettings as ChainGroupUi["Settings"],
		createDraft: (name) => createCustomLiquidChainRecord(name),
		isBuiltIn: isBuiltInLiquidChainId,
		name: "Liquid",
	},
};
