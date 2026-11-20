import { txOutAt } from "@humid/tx-manifest";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

export function walletTxOut(
	transactionHex: string,
	txid: string,
	vout: number,
): { confidential: boolean; hex: string } {
	const found = txOutAt(transactionHex, vout);

	if (!found.ok) {
		throw new WalletRpcResourceUnavailableError(
			"Could not locate the raw output of a wallet transaction.",
			{ reason: found.reason, txid, vout },
			WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
		);
	}

	const { assetForm, txOutHex, valueForm } = found.txOut;

	return {
		confidential: assetForm === "commitment" || valueForm === "commitment",
		hex: txOutHex,
	};
}
