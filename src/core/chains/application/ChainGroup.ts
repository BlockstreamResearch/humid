import type { WalletRpcBaseContext, WalletRpcDispatcher } from "@/core/wallet-rpc/types";
import type { WalletConnectNamespaceAdapter } from "@/core/walletconnect/types";

import type { ChainGroupId, ChainRecord } from "./ChainRecord";

export type ChainGroup<
	TContext extends WalletRpcBaseContext = WalletRpcBaseContext,
	TChain extends ChainRecord = ChainRecord,
> = {
	chains: readonly TChain[];
	id: ChainGroupId;
	walletConnectAdapter: WalletConnectNamespaceAdapter;
	walletRpcDispatcher: WalletRpcDispatcher<TContext>;
};
