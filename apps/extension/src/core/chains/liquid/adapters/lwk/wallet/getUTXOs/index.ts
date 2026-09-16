import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../../application/backends/LiquidWalletBackend";
import { mapLiquidUtxosForAsset } from "../../../../application/backends/mapLiquidUtxosForAsset";
import type { LiquidUTXO } from "../../../../domain/LiquidRpc";
import { toLiquidAssetId } from "../../../../domain/validation";
import { getLwkImplementation } from "../getLwkImplementation";
import { readExplicitWalletUtxos } from "../readExplicitWalletUtxos";
import { readWalletUtxos } from "../readWalletUtxos";

export function getWalletUtxosForAsset(
	account: LiquidWalletAccount,
	rawAssetId: string,
): LiquidUTXO[] {
	const implementation = getLwkImplementation(account);

	try {
		return mapLiquidUtxosForAsset(readWalletUtxos(implementation.wollet), {
			assetId: toLiquidAssetId(account.chainId, rawAssetId),
			rawAssetId,
		});
	} catch (error) {
		if (error instanceof WalletRpcResourceUnavailableError) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not read Liquid UTXOs from the LWK wallet state.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
		);
	}
}

export function getExplicitWalletUtxosForAsset(
	account: LiquidWalletAccount,
	rawAssetId: string,
): LiquidUTXO[] {
	const implementation = getLwkImplementation(account);

	try {
		return mapLiquidUtxosForAsset(readExplicitWalletUtxos(implementation.wollet), {
			assetId: toLiquidAssetId(account.chainId, rawAssetId),
			rawAssetId,
		});
	} catch (error) {
		if (error instanceof WalletRpcResourceUnavailableError) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not read the wallet's explicit Liquid UTXOs.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
		);
	}
}
