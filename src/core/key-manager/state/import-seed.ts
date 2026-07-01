import { createAccountRegistry } from "@/core/accounts/application/account-registry";

import type { KeyManagerState } from "../types";

export type AddImportedSeedInput = {
	createdAt?: number;
	name?: string;
	seedMaterial: string;
};

/**
 * Adds an imported-seed wallet to an already-unlocked key-manager state: a new key
 * source + wallet + first account group (via the account registry) plus the seed's
 * secret material, then selects the new account. Mirrors `createLocalRootKeyManagerState`
 * but additive — the existing wallets and secrets are left untouched.
 */
export function addImportedSeedToKeyManagerState(
	state: KeyManagerState,
	input: AddImportedSeedInput,
): KeyManagerState {
	const seedMaterial = input.seedMaterial.trim();

	if (!seedMaterial) {
		throw new Error("Missing seed material");
	}

	const now = input.createdAt ?? Date.now();
	const accountRegistry = createAccountRegistry();
	const { accountGroupId, accountModel, keySourceId } = accountRegistry.importSeedWallet({
		accountModel: state.accountModel,
		createdAt: now,
		name: input.name,
	});

	return {
		...state,
		accountModel: {
			...accountModel,
			selectedAccountGroupId: accountGroupId,
		},
		secretMaterials: {
			...state.secretMaterials,
			[keySourceId]: {
				createdAt: now,
				encoding: "utf8",
				keySourceId,
				kind: "seed",
				updatedAt: now,
				value: seedMaterial,
			},
		},
		updatedAt: now,
	};
}
