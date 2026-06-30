import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import {
	LIQUID_DESCRIPTOR_FORMATS,
	LIQUID_DESCRIPTOR_TYPES,
	type LiquidDescriptorFormat,
	type LiquidGetWalletDescriptorParams,
	type LiquidWalletDescriptorEntry,
} from "../../../../domain/LiquidRpc";
import { getSupportedLiquidDescriptorFormats } from "../../../../domain/validation";
import type { LiquidWalletAccount } from "../../../../ports/LiquidWalletBackend";
import { loadLwkWasm } from "../../loadLwkWasm";
import { getLwkImplementation } from "../getLwkImplementation";
import { addDescriptorChecksum } from "./addDescriptorChecksum";

export async function getWalletDescriptorEntries(
	account: LiquidWalletAccount,
	params: LiquidGetWalletDescriptorParams,
): Promise<LiquidWalletDescriptorEntry[]> {
	if (params.descriptorType !== LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR) {
		throw new WalletRpcInvalidParamsError(
			"Unsupported Liquid descriptor disclosure type.",
			{
				descriptorType: params.descriptorType,
				supportedDescriptorTypes: [LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR],
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_DESCRIPTOR_TYPE,
		);
	}

	const selectedFormat = selectDescriptorFormat(params);

	try {
		const lwk = await loadLwkWasm();
		const implementation = getLwkImplementation(account);
		const keyoriginXpub = implementation.signer.keyoriginXpub(lwk.Bip.bip84());

		if (selectedFormat === LIQUID_DESCRIPTOR_FORMATS.BIP380_BIP389_MULTIPATH) {
			return [createMultipathDescriptorEntry(keyoriginXpub)];
		}

		return [createSplitDescriptorEntry(keyoriginXpub)];
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not derive a public Liquid wallet descriptor.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_DESCRIPTOR_READ_FAILED,
		);
	}
}

function selectDescriptorFormat(params: LiquidGetWalletDescriptorParams): LiquidDescriptorFormat {
	const supportedFormats = getSupportedLiquidDescriptorFormats();
	const supportedFormatSet = new Set<string>(supportedFormats);
	const requestedFormats =
		params.descriptorFormat?.map((entry) => entry.format) ?? supportedFormats;
	const selectedFormat = requestedFormats.find((format): format is LiquidDescriptorFormat =>
		supportedFormatSet.has(format),
	);

	if (!selectedFormat) {
		throw new WalletRpcInvalidParamsError(
			"Unsupported Liquid descriptor format.",
			{
				requestedFormats,
				supportedFormats,
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_DESCRIPTOR_FORMAT,
		);
	}

	return selectedFormat;
}

function createMultipathDescriptorEntry(keyoriginXpub: string): LiquidWalletDescriptorEntry {
	return {
		branches: [
			{ addressIndex: "*", branch: "external", change: 0 },
			{ addressIndex: "*", branch: "internal", change: 1 },
		],
		branchLayout: "multipath",
		canDeriveConfidentialAddresses: false,
		canDeriveScriptPubKeys: true,
		canUnblindOutputs: false,
		descriptor: addDescriptorChecksum(`elwpkh(${keyoriginXpub}/<0;1>/*)`),
		descriptorType: LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR,
		format: LIQUID_DESCRIPTOR_FORMATS.BIP380_BIP389_MULTIPATH,
		standardsUsed: ["bip-0032", "bip-0044", "slip-0044", "bip-0084", "bip-0380", "bip-0389"],
	};
}

function createSplitDescriptorEntry(keyoriginXpub: string): LiquidWalletDescriptorEntry {
	return {
		branchDescriptors: [
			{
				branch: "external",
				change: 0,
				descriptor: addDescriptorChecksum(`elwpkh(${keyoriginXpub}/0/*)`),
			},
			{
				branch: "internal",
				change: 1,
				descriptor: addDescriptorChecksum(`elwpkh(${keyoriginXpub}/1/*)`),
			},
		],
		branchLayout: "split",
		canDeriveConfidentialAddresses: false,
		canDeriveScriptPubKeys: true,
		canUnblindOutputs: false,
		descriptorType: LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR,
		format: LIQUID_DESCRIPTOR_FORMATS.BIP380_SPLIT_BRANCHES,
		standardsUsed: ["bip-0032", "bip-0044", "slip-0044", "bip-0084", "bip-0380"],
	};
}
