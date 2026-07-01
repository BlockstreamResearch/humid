import type { ComponentType } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { LIQUID_CHAIN_GROUP_ID } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";

/**
 * A chain group's popup presentation: its display name and the settings component the
 * chain group itself implements (rendered on the per-chain settings page). The settings
 * component is React, so it can't cross the RPC boundary — this registry wires each
 * group's own component into the popup bundle, keyed by chain group id.
 */
export type ChainGroupUi = {
	Settings: ComponentType<{ chain: ChainRecord; onChange: (chain: ChainRecord) => void }>;
	name: string;
};

export const chainGroupUis: Record<string, ChainGroupUi> = {
	[LIQUID_CHAIN_GROUP_ID]: {
		// The concrete chain is a LiquidChainRecord at runtime (its group id matches).
		Settings: LiquidChainSettings as ChainGroupUi["Settings"],
		name: "Liquid",
	},
};
