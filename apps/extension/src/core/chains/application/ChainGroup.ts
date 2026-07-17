import type { WalletMethodRegistry } from "@/core/wallet-methods/createWalletMethodRegistry";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";
import type { WalletConnectNamespaceAdapter } from "@/core/walletconnect/types";

import type { ChainGroupId, ChainRecord } from "./ChainRecord";

export type ChainGroup<
	TContext extends WalletRpcBaseContext = WalletRpcBaseContext,
	TChain extends ChainRecord = ChainRecord,
> = {
	chains: readonly TChain[];
	id: ChainGroupId;
	walletConnectAdapter: WalletConnectNamespaceAdapter;
	/** The chain's RPC surface: JSON-RPC dispatcher plus the method names it advertises. */
	walletRpcDispatcher: WalletMethodRegistry<TContext>;
};
