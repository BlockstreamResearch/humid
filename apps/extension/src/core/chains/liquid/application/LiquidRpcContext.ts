import type { PortfolioData } from "@/core/accounts/application/accounts-rpc/model/types";
import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";
import type { LiquidDappAccountScope } from "./dappAccountScope";

/**
 * Reads the persisted portfolio snapshot for one account group + chain (null if none is cached).
 * Injected only where a snapshot store exists (the injected-dapp dispatch path); read methods that
 * receive it serve `getBalance`/`getUTXOs` from the snapshot on a hit and fall back to a live scan
 * on a miss. Reads never trigger a sync — freshness is owned by the popup/alarm refresh.
 */
export type ReadPortfolioSnapshot = (
	accountGroupId: string,
	chainId: string,
) => Promise<{ data: PortfolioData } | null>;

/**
 * Context a dapp RPC call carries into the Liquid router: the target chain, the current
 * key-manager state, and (for dapp calls) the session's per-account grant. Backends are
 * NOT here — they are the router's private dependency, injected into the method context
 * below. `accountScope` is absent for internal calls → full access to the default account.
 */
export type LiquidWalletRpcContext = WalletRpcBaseContext & {
	accountScope?: LiquidDappAccountScope;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	/** Optional serve-from-cache hook for read methods; absent → they fall back to a live scan. */
	readPortfolioSnapshot?: ReadPortfolioSnapshot;
	updateKeyManagerState?: UpdateKeyManagerState;
};

/**
 * Context every Liquid RPC method receives: the dispatch context plus the wallet and
 * identity backends the router injects. One shared shape — each method reads only the
 * subset it needs — so all methods fit a single registry array.
 */
export type LiquidRpcMethodContext = LiquidWalletRpcContext & {
	identityBackend: LiquidIdentityBackend;
	walletBackend: LiquidWalletBackend;
};
