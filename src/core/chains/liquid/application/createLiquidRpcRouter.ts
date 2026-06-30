import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletRpcDispatcher } from "@/core/wallet-rpc/dispatcher";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../domain/LiquidRpc";
import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";
import { getLiquidBalance } from "./methods/getBalance";
import { getLiquidIdentityPublicKey } from "./methods/getIdentityPublicKey";
import { getLiquidIdentitySharedKey } from "./methods/getIdentitySharedKey";
import { getLiquidUTXOs } from "./methods/getUTXOs";
import { getLiquidWalletDescriptor } from "./methods/getWalletDescriptor";
import { processLiquidConfidentialTransaction } from "./methods/processConfidentialTransaction";
import { sendLiquidTransfer } from "./methods/sendTransfer";
import { signLiquidIdentity } from "./methods/signIdentity";
import { signLiquidMessage } from "./methods/signMessage";
import { signLiquidPset } from "./methods/signPset";

export type LiquidWalletRpcContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
};

export type CreateLiquidRpcRouterDependencies = {
	identityBackend: LiquidIdentityBackend;
	walletBackend: LiquidWalletBackend;
};

export function createLiquidRpcRouter({
	identityBackend,
	walletBackend,
}: CreateLiquidRpcRouterDependencies) {
	return createWalletRpcDispatcher<LiquidWalletRpcContext>({
		[LIQUID_WALLET_RPC_METHODS.GET_BALANCE]: (params, context) =>
			getLiquidBalance(params, {
				...context,
				walletBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.GET_UTXOS]: (params, context) =>
			getLiquidUTXOs(params, {
				...context,
				walletBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.GET_WALLET_DESCRIPTOR]: (params, context) =>
			getLiquidWalletDescriptor(params, {
				...context,
				walletBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_PUBLIC_KEY]: (params, context) =>
			getLiquidIdentityPublicKey(params, {
				...context,
				identityBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_SHARED_KEY]: (params, context) =>
			getLiquidIdentitySharedKey(params, {
				...context,
				identityBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION]: () =>
			processLiquidConfidentialTransaction(),
		[LIQUID_WALLET_RPC_METHODS.SEND_TRANSFER]: (params, context) =>
			sendLiquidTransfer(params, {
				...context,
				walletBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.SIGN_IDENTITY]: (params, context) =>
			signLiquidIdentity(params, {
				...context,
				identityBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.SIGN_MESSAGE]: (params, context) =>
			signLiquidMessage(params, {
				...context,
				walletBackend,
			}),
		[LIQUID_WALLET_RPC_METHODS.SIGN_PSET]: (params, context) =>
			signLiquidPset(params, {
				...context,
				walletBackend,
			}),
	});
}
