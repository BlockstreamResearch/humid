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

/** A token row's content — the owning chain renders it inside the generic token-list link. */
type TokenRowComponent = ComponentType<{ token: PortfolioViewAsset }>;

/** The asset detail body: the balance, the (generic) account actions slot, and activity. */
type AssetViewComponent = ComponentType<{
	actions: ReactNode;
	activity: PortfolioViewActivityFeed;
	chain: ChainRecord;
	token: PortfolioViewAsset;
}>;

/** The asset "About" panel (identity/registry/decimals) — the asset header opens it in a drawer. */
type AssetAboutComponent = ComponentType<{ chain: ChainRecord; token: PortfolioViewAsset }>;

/** The native-asset balance headline (raw amount, formatted by the chain at render). */
type BalanceHeadlineComponent = ComponentType<{
	isSyncing: boolean;
	native: { amount: bigint; decimals: number; symbol: string };
}>;

/**
 * A chain group's popup presentation: its display name, the components the chain group itself
 * implements — chain config (Create/Settings) and asset display (TokenRow/AssetView/
 * BalanceHeadline), all living with their chain under core/chains/<group> — plus a
 * fresh-custom-chain factory and a built-in predicate. These are React/runtime values that can't
 * cross the RPC boundary, so this registry wires each group into the popup bundle; generic pages
 * look a group up by `chainGroupId` and inject its parts.
 */
export type ChainGroupUi = {
	AssetAbout: AssetAboutComponent;
	AssetView: AssetViewComponent;
	BalanceHeadline: BalanceHeadlineComponent;
	Create: ChainComponent;
	Settings: ChainComponent;
	TokenRow: TokenRowComponent;
	createDraft: (name: string) => ChainRecord;
	/** "View on explorer" URL for a broadcast txid, or null if the chain has no explorer configured. */
	explorerTxUrl: (chain: ChainRecord, txid: string) => string | null;
	isBuiltIn: (chainId: string) => boolean;
	name: string;
};

export const chainGroupUis: Record<string, ChainGroupUi> = {
	[LIQUID_CHAIN_GROUP_ID]: {
		// The concrete chain is a LiquidChainRecord at runtime (its group id matches), and the
		// asset metadata a LiquidAssetMetadata — the Liquid components cast to those.
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
