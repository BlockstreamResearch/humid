import type { ChainAccountMetadata, ChainAccountTypeId, ChainGroupId } from "../model/account-type";
import type { DerivationLocator } from "../model/chain-account";
import type { AccountIdentifier, ChainId } from "../model/identifiers";

export type MaterializeAccountTypeInput<TContext extends object = object> = {
	chainId: ChainId;
	context: TContext;
};

export type MaterializeAccountTypeResult<
	TMetadata extends ChainAccountMetadata = ChainAccountMetadata,
> = {
	accountIdentifier: AccountIdentifier;
	derivation?: DerivationLocator;
	metadata?: TMetadata;
};

export type AccountTypeAdapter<
	TContext extends object = object,
	TMetadata extends ChainAccountMetadata = ChainAccountMetadata,
> = {
	chainGroupId: ChainGroupId;
	id: ChainAccountTypeId;
	materialize: (
		input: MaterializeAccountTypeInput<TContext>,
	) => MaterializeAccountTypeResult<TMetadata>;
};

export type RegisteredAccountTypeAdapter = AccountTypeAdapter<never, ChainAccountMetadata>;
