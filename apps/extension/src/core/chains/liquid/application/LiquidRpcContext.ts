import type { PortfolioData } from "@/core/accounts/application/accounts-rpc/model/types";
import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";
import type { LiquidDappAccountScope } from "./dappAccountScope";

export type ReadPortfolioSnapshot = (
	accountGroupId: string,
	chainId: string,
) => Promise<{ data: PortfolioData } | null>;

export type LiquidWalletRpcContext = WalletRpcBaseContext & {
	accountScope?: LiquidDappAccountScope;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	readPortfolioSnapshot?: ReadPortfolioSnapshot;
	updateKeyManagerState?: UpdateKeyManagerState;
};

export type LiquidRpcMethodContext = LiquidWalletRpcContext & {
	identityBackend: LiquidIdentityBackend;
	walletBackend: LiquidWalletBackend;
};
