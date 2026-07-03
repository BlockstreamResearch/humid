import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";
import type { LiquidDappAccountScope } from "./dappAccountScope";

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
