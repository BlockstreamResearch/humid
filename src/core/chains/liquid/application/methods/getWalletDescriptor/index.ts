import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { LiquidChainId } from "../../../domain/LiquidChain";
import {
	LIQUID_DESCRIPTOR_TYPES,
	type LiquidGetWalletDescriptorResult,
} from "../../../domain/LiquidRpc";
import {
	getSupportedLiquidDescriptorFormats,
	parseLiquidGetWalletDescriptorParams,
} from "../../../domain/validation";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../../ports/LiquidWalletBackend";

export type LiquidGetWalletDescriptorContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	keyManagerState: KeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function getLiquidWalletDescriptor(
	params: unknown,
	context: LiquidGetWalletDescriptorContext,
): Promise<LiquidGetWalletDescriptorResult> {
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

	const account = await context.walletBackend.resolveAccount({
		chainId: context.chainId,
		keyManagerState: context.keyManagerState,
	});

	await requireDescriptorDisclosureConfirmation(context, account, parsedParams.descriptorType);

	return {
		accountIdentifier: account.accountIdentifier,
		chainId: account.chainId,
		descriptors: await context.walletBackend.getDescriptorEntries(account, parsedParams),
		policyAssetId: account.policyAssetId,
	};
}

async function requireDescriptorDisclosureConfirmation(
	context: LiquidGetWalletDescriptorContext,
	account: LiquidWalletAccount,
	descriptorType: string,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Wallet descriptor disclosure requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: {
			accountIdentifier: account.accountIdentifier,
			chainId: account.chainId,
			descriptorType,
		},
		message: "A dapp wants to read the public Liquid wallet descriptor for this account.",
		title: "Share Liquid descriptor?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
