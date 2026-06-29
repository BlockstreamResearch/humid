import { LOCAL_ROOT_KEYRING_TYPE } from "@/core/key-manager/state/constants";
import type { KeyManagerState, KeyringRecord } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import { toLiquidAssetId } from "../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../ports/LiquidWalletBackend";
import { createLwkMnemonicFromSeedMaterial } from "./createLwkMnemonic";
import { createLwkNetwork } from "./createLwkNetwork";
import { loadLwkWasm } from "./loadLwkWasm";
import type { LwkLiquidAccountImplementation } from "./types";

export function createLwkWalletBackend(): LiquidWalletBackend {
	return {
		getBalance: getWalletBalanceForAsset,
		resolveAccount: createLwkLiquidAccount,
		syncAccount: scanAccount,
	};
}

async function createLwkLiquidAccount(input: {
	chainId: LiquidWalletAccount["chainId"];
	keyManagerState: KeyManagerState;
}): Promise<LiquidWalletAccount> {
	const keyring = getLocalRootKeyring(input.keyManagerState);
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chainId);
	const mnemonic = createLwkMnemonicFromSeedMaterial(lwk, keyring.material.value);

	try {
		const signer = new lwk.Signer(mnemonic, network);
		const descriptor = signer.wpkhSlip77Descriptor();
		const wollet = new lwk.Wollet(network, descriptor);
		const dwid = wollet.dwid();
		const rawPolicyAssetId = network.policyAsset().toString();
		const policyAssetId = toLiquidAssetId(input.chainId, rawPolicyAssetId);

		return {
			accountIdentifier: `${input.chainId}:${dwid}`,
			chainId: input.chainId,
			dwid,
			implementation: {
				network,
				signer,
				wollet,
			},
			policyAssetId,
			rawPolicyAssetId,
		};
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not derive a Liquid software wallet from the local root keyring.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_DERIVATION_FAILED,
		);
	}
}

function getLocalRootKeyring(state: KeyManagerState): KeyringRecord {
	const keyring = state.keyrings.find(
		(record) => record.type === LOCAL_ROOT_KEYRING_TYPE && record.material.kind === "seed",
	);

	if (!keyring) {
		throw new WalletRpcResourceUnavailableError(
			"No local-root seed keyring is available for Liquid.",
			undefined,
			WALLET_RPC_ERROR_REASONS.MISSING_LOCAL_ROOT_KEYRING,
		);
	}

	return keyring;
}

async function scanAccount(account: LiquidWalletAccount): Promise<void> {
	const implementation = getLwkImplementation(account);

	try {
		const update = await implementation.network
			.defaultEsploraClient()
			.fullScan(implementation.wollet);

		if (update) {
			implementation.wollet.applyUpdate(update);
		}
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not sync the Liquid wallet through the LWK Esplora backend.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_SYNC_FAILED,
		);
	}
}

function getWalletBalanceForAsset(account: LiquidWalletAccount, rawAssetId: string): string {
	const implementation = getLwkImplementation(account);
	const entries = implementation.wollet.balance().entries();
	const assetId = toLiquidAssetId(account.chainId, rawAssetId);

	if (entries instanceof Map) {
		return amountToString(entries.get(rawAssetId) ?? entries.get(assetId));
	}

	if (Array.isArray(entries)) {
		const entry = entries.find(
			(entryValue): entryValue is [unknown, unknown] =>
				Array.isArray(entryValue) && String(entryValue[0]) === rawAssetId,
		);

		return amountToString(entry?.[1]);
	}

	if (typeof entries === "object" && entries !== null) {
		const objectEntries = entries as Record<string, unknown>;

		return amountToString(objectEntries[rawAssetId] ?? objectEntries[assetId]);
	}

	return "0";
}

function getLwkImplementation(account: LiquidWalletAccount): LwkLiquidAccountImplementation {
	return account.implementation as LwkLiquidAccountImplementation;
}

function amountToString(value: unknown): string {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
	if (typeof value === "string" && /^\d+$/u.test(value)) return value;

	return "0";
}
