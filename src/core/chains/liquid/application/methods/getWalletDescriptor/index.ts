import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { WALLET_CAPABILITY_GROUPS } from "@/core/wallet-methods/capability";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { restrictedLiquidAssetId } from "../../../domain/LiquidAsset";
import {
	LIQUID_DESCRIPTOR_TYPES,
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetWalletDescriptorParams,
	type LiquidGetWalletDescriptorResult,
} from "../../../domain/LiquidRpc";
import {
	getSupportedLiquidDescriptorFormats,
	parseLiquidGetWalletDescriptorParams,
} from "../../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";

export type LiquidGetWalletDescriptorContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidGetWalletDescriptorReview = {
	account: LiquidWalletAccount;
};

export const getLiquidWalletDescriptor = createWalletMethod<
	LiquidGetWalletDescriptorParams,
	LiquidGetWalletDescriptorContext,
	LiquidGetWalletDescriptorReview,
	LiquidGetWalletDescriptorResult
>({
	capability: {
		access: "read",
		description: "See this account's public addresses (its wallet descriptor).",
		group: WALLET_CAPABILITY_GROUPS.VIEW_ADDRESSES,
		id: LIQUID_WALLET_RPC_METHODS.GET_WALLET_DESCRIPTOR,
		label: "View addresses",
		restricted: ({ context }) => ({
			accountIdentifier: "",
			chainId: context.chain.id,
			descriptors: [],
			policyAssetId: restrictedLiquidAssetId(context.chain.id),
		}),
	},
	confirmation: ({ params, review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			chainId: review.account.chainId,
			descriptorType: params.descriptorType,
			kind: "liquid.getWalletDescriptor",
		},
		message: "A dapp wants to read the public Liquid wallet descriptor for this account.",
		title: "Share Liquid descriptor?",
	}),
	execute: async ({ context, params, review }) => ({
		accountIdentifier: review.account.accountIdentifier,
		chainId: review.account.chainId,
		descriptors: await context.walletBackend.getDescriptorEntries(review.account, params),
		policyAssetId: review.account.policyAssetId,
	}),
	parse: parseGetWalletDescriptorParams,
	review: async ({ context }) => ({
		account: await context.walletBackend.resolveAccount({
			chain: context.chain,
			keyManagerState: context.keyManagerState,
			updateKeyManagerState: context.updateKeyManagerState,
		}),
	}),
});

function parseGetWalletDescriptorParams(params: unknown): LiquidGetWalletDescriptorParams {
	const parsedParams = parseLiquidGetWalletDescriptorParams(params);

	if (parsedParams.descriptorType !== LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR) {
		throw new WalletRpcResourceUnavailableError(
			"Only public Liquid wallet descriptors are supported.",
			{
				descriptorType: parsedParams.descriptorType,
				supportedDescriptorTypes: [LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR],
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_DESCRIPTOR_TYPE,
		);
	}

	const supportedFormats = getSupportedLiquidDescriptorFormats();
	const supportedFormatSet = new Set<string>(supportedFormats);
	const requestedFormats = parsedParams.descriptorFormat?.map((entry) => entry.format);

	if (requestedFormats && !requestedFormats.some((format) => supportedFormatSet.has(format))) {
		throw new WalletRpcResourceUnavailableError(
			"Unsupported Liquid descriptor format.",
			{
				requestedFormats,
				supportedFormats,
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_DESCRIPTOR_FORMAT,
		);
	}

	return parsedParams;
}
