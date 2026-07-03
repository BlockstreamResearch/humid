import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";

/**
 * Context a dapp RPC call carries into the Liquid router: the target chain and the
 * current key-manager state. Backends are NOT here — they are the router's private
 * dependency, injected into the method context below.
 */
export type LiquidWalletRpcContext = WalletRpcBaseContext & {
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
