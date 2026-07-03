import type { AccountModelState } from "../model/account-model";
import type { KeySourceId } from "../model/identifiers";
import type { WalletRecord } from "../model/wallet";

export function getWalletByKeySource(
	accountModel: AccountModelState,
	keySourceId: KeySourceId,
): WalletRecord {
	const wallet = Object.values(accountModel.wallets).find(
		(record) => record.keySourceId === keySourceId,
	);

	if (!wallet) {
		throw new Error(`No wallet is available for key source: ${keySourceId}`);
	}

	return wallet;
}
