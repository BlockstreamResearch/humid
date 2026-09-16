import type { ComponentType, ReactNode } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type {
	PortfolioViewActivityFeed,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { createCustomLiquidChainRecord } from "@/core/chains/liquid/chains/createBuiltInLiquidChains";
import { LiquidChainCreate } from "@/core/chains/liquid/chains/LiquidChainCreate";
import { LIQUID_CHAIN_GROUP_ID } from "@/core/chains/liquid/chains/LiquidChainRecord";
import { LiquidChainSettings } from "@/core/chains/liquid/chains/LiquidChainSettings";
import { isBuiltInLiquidChainId } from "@/core/chains/liquid/domain/LiquidChain";
import { LiquidAssetAbout } from "@/core/chains/liquid/presentation/LiquidAssetAbout";
import { LiquidAssetView } from "@/core/chains/liquid/presentation/LiquidAssetView";
import { LiquidBalanceHeadline } from "@/core/chains/liquid/presentation/LiquidBalanceHeadline";
import { liquidExplorerTxUrl } from "@/core/chains/liquid/presentation/liquidExplorerTxUrl";
import { LiquidTokenRow } from "@/core/chains/liquid/presentation/LiquidTokenRow";

type ChainComponent = ComponentType<{ chain: ChainRecord; onChange: (chain: ChainRecord) => void }>;

type TokenRowComponent = ComponentType<{ token: PortfolioViewAsset }>;

type AssetViewComponent = ComponentType<{
	actions: ReactNode;
	activity: PortfolioViewActivityFeed;
	chain: ChainRecord;
	token: PortfolioViewAsset;
}>;

type AssetAboutComponent = ComponentType<{ chain: ChainRecord; token: PortfolioViewAsset }>;

type BalanceHeadlineComponent = ComponentType<{
	isSyncing: boolean;
	native: { amount: bigint; decimals: number; symbol: string };
}>;

export type ChainGroupUi = {
	AssetAbout: AssetAboutComponent;
	AssetView: AssetViewComponent;
	BalanceHeadline: BalanceHeadlineComponent;
	Create: ChainComponent;
	Settings: ChainComponent;
	TokenRow: TokenRowComponent;
	createDraft: (name: string) => ChainRecord;
	explorerTxUrl: (chain: ChainRecord, txid: string) => string | null;
	isBuiltIn: (chainId: string) => boolean;
	name: string;
};

export const chainGroupUis: Record<string, ChainGroupUi> = {
	[LIQUID_CHAIN_GROUP_ID]: {
		AssetAbout: LiquidAssetAbout,
		AssetView: LiquidAssetView,
		BalanceHeadline: LiquidBalanceHeadline,
		Create: LiquidChainCreate as ChainComponent,
		Settings: LiquidChainSettings as ChainComponent,
		TokenRow: LiquidTokenRow,
		createDraft: (name) => createCustomLiquidChainRecord(name),
		explorerTxUrl: liquidExplorerTxUrl,
		isBuiltIn: isBuiltInLiquidChainId,
		name: "Liquid",
	},
};
