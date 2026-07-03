import type {
	AccountTypeAdapter,
	RegisteredAccountTypeAdapter,
} from "../adapters/AccountTypeAdapter";
import type { ChainAccountMetadata, ChainAccountTypeId } from "../model/account-type";

export type AccountTypeRegistry = {
	get: <TContext extends object, TMetadata extends ChainAccountMetadata>(
		accountTypeId: ChainAccountTypeId,
	) => AccountTypeAdapter<TContext, TMetadata>;
};

export function createAccountTypeRegistry(
	accountTypes: RegisteredAccountTypeAdapter[] = [],
): AccountTypeRegistry {
	const adapters = new Map<ChainAccountTypeId, RegisteredAccountTypeAdapter>();

	for (const accountType of accountTypes) {
		if (adapters.has(accountType.id)) {
			throw new Error(`Duplicate account type adapter: ${accountType.id}`);
		}

		adapters.set(accountType.id, accountType);
	}

	return {
		get<TContext extends object, TMetadata extends ChainAccountMetadata>(
			accountTypeId: ChainAccountTypeId,
		) {
			const adapter = adapters.get(accountTypeId);

			if (!adapter) {
				throw new Error(`Account type adapter is not registered: ${accountTypeId}`);
			}

			return adapter as AccountTypeAdapter<TContext, TMetadata>;
		},
	};
}
