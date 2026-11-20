import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetAddressParams,
	type LiquidGetAddressResult,
	type LiquidGetBalanceParams,
	type LiquidGetBalanceResult,
	type LiquidGetIdentityPublicKeyParams,
	type LiquidGetIdentityPublicKeyResult,
	type LiquidGetIdentitySharedKeyParams,
	type LiquidGetIdentitySharedKeyResult,
	type LiquidGetUTXOsParams,
	type LiquidGetUTXOsResult,
	type LiquidGetWalletDescriptorParams,
	type LiquidGetWalletDescriptorResult,
	type LiquidProcessConfidentialTransactionParams,
	type LiquidProcessConfidentialTransactionResult,
	type LiquidSendTransferParams,
	type LiquidSendTransferResult,
	type LiquidSignIdentityParams,
	type LiquidSignIdentityResult,
	type LiquidSignMessageParams,
	type LiquidSignMessageResult,
	type LiquidSignPsetParams,
	type LiquidSignPsetResult,
	type LiquidWalletRpcMethod,
} from "@humid/wallet-rpc";

import { invokeMethod } from "./rpc";
import type { CaipRpcProvider } from "./types";

export type WalletClient = {
	getAddress(params?: LiquidGetAddressParams): Promise<LiquidGetAddressResult>;
	getBalance(params?: LiquidGetBalanceParams): Promise<LiquidGetBalanceResult>;
	getUTXOs(params?: LiquidGetUTXOsParams): Promise<LiquidGetUTXOsResult>;
	getWalletDescriptor(
		params: LiquidGetWalletDescriptorParams,
	): Promise<LiquidGetWalletDescriptorResult>;
	sendTransfer(params: LiquidSendTransferParams): Promise<LiquidSendTransferResult>;
	signMessage(params: LiquidSignMessageParams): Promise<LiquidSignMessageResult>;
	signPset(params: LiquidSignPsetParams): Promise<LiquidSignPsetResult>;
	getIdentityPublicKey(
		params: LiquidGetIdentityPublicKeyParams,
	): Promise<LiquidGetIdentityPublicKeyResult>;
	getIdentitySharedKey(
		params: LiquidGetIdentitySharedKeyParams,
	): Promise<LiquidGetIdentitySharedKeyResult>;
	signIdentity(params: LiquidSignIdentityParams): Promise<LiquidSignIdentityResult>;
	processConfidentialTransaction(
		params: LiquidProcessConfidentialTransactionParams,
	): Promise<LiquidProcessConfidentialTransactionResult>;
};

export function createWalletClient(provider: CaipRpcProvider, scope: string): WalletClient {
	const call =
		<Result>(method: LiquidWalletRpcMethod) =>
		(params?: unknown) =>
			invokeMethod<Result>(provider, scope, method, params);
	const methods = LIQUID_WALLET_RPC_METHODS;

	return {
		getAddress: call<LiquidGetAddressResult>(methods.GET_ADDRESS),
		getBalance: call<LiquidGetBalanceResult>(methods.GET_BALANCE),
		getIdentityPublicKey: call<LiquidGetIdentityPublicKeyResult>(methods.GET_IDENTITY_PUBLIC_KEY),
		getIdentitySharedKey: call<LiquidGetIdentitySharedKeyResult>(methods.GET_IDENTITY_SHARED_KEY),
		getUTXOs: call<LiquidGetUTXOsResult>(methods.GET_UTXOS),
		getWalletDescriptor: call<LiquidGetWalletDescriptorResult>(methods.GET_WALLET_DESCRIPTOR),
		processConfidentialTransaction: call<LiquidProcessConfidentialTransactionResult>(
			methods.PROCESS_CONFIDENTIAL_TRANSACTION,
		),
		sendTransfer: call<LiquidSendTransferResult>(methods.SEND_TRANSFER),
		signIdentity: call<LiquidSignIdentityResult>(methods.SIGN_IDENTITY),
		signMessage: call<LiquidSignMessageResult>(methods.SIGN_MESSAGE),
		signPset: call<LiquidSignPsetResult>(methods.SIGN_PSET),
	};
}
