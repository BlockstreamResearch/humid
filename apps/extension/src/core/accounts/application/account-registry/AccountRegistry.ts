import {
	createAccountTypeRegistry,
	type AccountTypeRegistry,
} from "./account-types/AccountTypeRegistry";
import type { RegisteredAccountTypeAdapter } from "./adapters/AccountTypeAdapter";
import type { AccountModelState } from "./model/account-model";
import type { ChainAccountMetadata, ChainAccountTypeId } from "./model/account-type";
import type {
	AccountGroupId,
	AccountIdentifier,
	ChainId,
	DappSessionId,
	KeySourceId,
} from "./model/identifiers";
import {
	createLocalRootAccountModel,
	type CreateLocalRootAccountModelInput,
} from "./operations/createLocalRootAccountModel";
import {
	createNextAccountGroup,
	type CreateNextAccountGroupInput,
} from "./operations/createNextAccountGroup";
import {
	ensureChainAccount,
	type EnsureChainAccountInput,
	type EnsureChainAccountResult,
} from "./operations/ensureChainAccount";
import { findDappSession, type FindDappSessionInput } from "./operations/findDappSession";
import { getSelectedAccountGroup } from "./operations/getSelectedAccountGroup";
import { getWalletByKeySource } from "./operations/getWalletByKeySource";
import { grantDappSession, type GrantDappSessionInput } from "./operations/grantDappSession";
import { importSeedWallet, type ImportSeedWalletInput } from "./operations/importSeedWallet";
import { removeAccountGroup, type RemoveAccountGroupInput } from "./operations/removeAccountGroup";
import { removeWallet, type RemoveWalletInput } from "./operations/removeWallet";
import { resolveChainAccount } from "./operations/resolveChainAccount";
import { revokeAccountFromDappSession } from "./operations/revokeAccountFromDappSession";
import { revokeDappSession } from "./operations/revokeDappSession";
import { setDappSessionMethodPolicy } from "./operations/setDappSessionMethodPolicy";

export type AccountRegistryInput = {
	accountTypes?: RegisteredAccountTypeAdapter[];
};

export type EnsureRegisteredChainAccountInput<TContext extends object = object> = Omit<
	EnsureChainAccountInput<TContext>,
	"accountTypes"
>;

export class AccountRegistry {
	private readonly accountTypes: AccountTypeRegistry;

	constructor(input: AccountRegistryInput = {}) {
		this.accountTypes = createAccountTypeRegistry(input.accountTypes);
	}

	createLocalRootAccountModel(input: CreateLocalRootAccountModelInput = {}) {
		return createLocalRootAccountModel(input);
	}

	createNextAccountGroup(input: CreateNextAccountGroupInput) {
		return createNextAccountGroup(input);
	}

	ensureChainAccount<TContext extends object, TMetadata extends ChainAccountMetadata>(
		input: EnsureRegisteredChainAccountInput<TContext>,
	): EnsureChainAccountResult<TMetadata> {
		return ensureChainAccount<TContext, TMetadata>({
			...input,
			accountTypes: this.accountTypes,
		});
	}

	findDappSession(accountModel: AccountModelState, input: FindDappSessionInput) {
		return findDappSession(accountModel, input);
	}

	getSelectedAccountGroup(accountModel: AccountModelState) {
		return getSelectedAccountGroup(accountModel);
	}

	getWalletByKeySource(accountModel: AccountModelState, keySourceId: KeySourceId) {
		return getWalletByKeySource(accountModel, keySourceId);
	}

	grantDappSession(input: GrantDappSessionInput) {
		return grantDappSession(input);
	}

	importSeedWallet(input: ImportSeedWalletInput) {
		return importSeedWallet(input);
	}

	removeAccountGroup(input: RemoveAccountGroupInput) {
		return removeAccountGroup(input);
	}

	removeWallet(input: RemoveWalletInput) {
		return removeWallet(input);
	}

	resolveChainAccount(input: {
		accountGroupId?: AccountGroupId;
		accountIdentifier?: AccountIdentifier;
		accountModel: AccountModelState;
		accountTypeId?: ChainAccountTypeId;
		chainGroupId?: string;
		chainId: ChainId;
	}) {
		return resolveChainAccount(input);
	}

	revokeAccountFromDappSession(input: {
		accountGroupId: AccountGroupId;
		accountModel: AccountModelState;
		sessionId: DappSessionId;
	}) {
		return revokeAccountFromDappSession(input);
	}

	revokeDappSession(input: { accountModel: AccountModelState; sessionId: DappSessionId }) {
		return revokeDappSession(input);
	}

	setDappSessionMethodPolicy(input: {
		accountModel: AccountModelState;
		methods: Record<string, boolean>;
		sessionId: DappSessionId;
	}) {
		return setDappSessionMethodPolicy(input);
	}
}
