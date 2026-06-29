import type { KeyManagerState } from "@/core/key-manager/types";
import { createWalletRpcDispatcher } from "@/core/wallet-rpc/dispatcher";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainId } from "../domain/LiquidChain";
import { LIQUID_WALLET_RPC_METHODS } from "../domain/LiquidRpc";
import type { LiquidWalletBackend } from "../ports/LiquidWalletBackend";
import { getLiquidBalance } from "./methods/getBalance";

export type LiquidWalletRpcContext = WalletRpcBaseContext & {
	chainId: LiquidChainId;
	keyManagerState: KeyManagerState;
};

export function createLiquidRpcRouter(walletBackend: LiquidWalletBackend) {
	return createWalletRpcDispatcher<LiquidWalletRpcContext>({
		[LIQUID_WALLET_RPC_METHODS.GET_BALANCE]: (params, context) =>
			getLiquidBalance(params, {
				...context,
				walletBackend,
			}),
	});
}
