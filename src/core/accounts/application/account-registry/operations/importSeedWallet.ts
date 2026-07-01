import {
	createAccountGroupId,
	createKeySourceId,
	createWalletId,
} from "../ids/createAccountModelId";
import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";
import type { AccountGroupId, KeySourceId, WalletId } from "../model/identifiers";
import type { KeySourceRecord } from "../model/key-source";
import type { WalletRecord } from "../model/wallet";

export type ImportSeedWalletInput = {
	accountModel: AccountModelState;
	createdAt?: number;
	keySourceId?: KeySourceId;
	name?: string;
};

export type ImportSeedWalletResult = {
	accountGroupId: AccountGroupId;
	accountModel: AccountModelState;
	keySourceId: KeySourceId;
	walletId: WalletId;
};

/**
 * Adds an imported-seed wallet (its own key source + wallet + first account group at
 * `groupIndex 0`) to an existing account model, leaving the current wallets untouched.
 * The seed's secret value is stored separately by the key manager, which attaches it to
 * the returned `keySourceId`. Chain-agnostic — no signing or chain-specific logic here.
 */
export function importSeedWallet(input: ImportSeedWalletInput): ImportSeedWalletResult {
	const now = input.createdAt ?? Date.now();
	const keySourceId = input.keySourceId ?? createKeySourceId();
	const walletId = createWalletId();
	const accountGroupId = createAccountGroupId();
	const name = input.name ?? "Imported account";

	const keySource: KeySourceRecord = {
		createdAt: now,
		id: keySourceId,
		kind: "imported-mnemonic",
		material: { kind: "seed", storage: "encrypted-vault" },
		metadata: { source: "imported" },
		name,
		updatedAt: now,
	};

	const wallet: WalletRecord = {
		accountGroupIds: [accountGroupId],
		createdAt: now,
		id: walletId,
		keySourceId,
		kind: "entropy",
		metadata: { source: "imported" },
		name,
		updatedAt: now,
	};

	const accountGroup: AccountGroupRecord = {
		chainAccountIds: [],
		createdAt: now,
		groupIndex: 0,
		id: accountGroupId,
		kind: "multichain",
		metadata: { source: "imported" },
		name,
		updatedAt: now,
		walletId,
	};

	return {
		accountGroupId,
		accountModel: {
			...input.accountModel,
			accountGroups: {
				...input.accountModel.accountGroups,
				[accountGroupId]: accountGroup,
			},
			keySources: {
				...input.accountModel.keySources,
				[keySourceId]: keySource,
			},
			updatedAt: now,
			wallets: {
				...input.accountModel.wallets,
				[walletId]: wallet,
			},
		},
		keySourceId,
		walletId,
	};
}
