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
import { resolveChainAccount } from "./operations/resolveChainAccount";
import { revokeDappSession } from "./operations/revokeDappSession";

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

	revokeDappSession(input: { accountModel: AccountModelState; sessionId: DappSessionId }) {
		return revokeDappSession(input);
	}
}
