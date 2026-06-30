import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { LiquidWalletRpcContext } from "@/core/chains/liquid/application/createLiquidRpcRouter";

import type { LiquidChainRecord } from "./chains/LiquidChainRecord";

export type LiquidChainGroup = ChainGroup<LiquidWalletRpcContext, LiquidChainRecord>;
