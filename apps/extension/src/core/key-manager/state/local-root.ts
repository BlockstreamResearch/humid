import { createAccountRegistry } from "@/core/accounts/application/account-registry";

import type { CreateLocalRootKeyManagerStateInput, KeyManagerState } from "../types";
import { KEY_MANAGER_STATE_VERSION } from "./constants";

export function createLocalRootKeyManagerState(
	input: CreateLocalRootKeyManagerStateInput,
): KeyManagerState {
	const seedMaterial = input.seedMaterial.trim();

	if (!seedMaterial) {
		throw new Error("Missing seed material");
	}

	const now = input.createdAt ?? Date.now();
	const accountRegistry = createAccountRegistry();
	const { accountModel, keySourceId } = accountRegistry.createLocalRootAccountModel({
		createdAt: now,
		keySourceId: input.keySourceId,
		name: input.name,
		source: input.source,
	});

	return {
		accountModel,
		createdAt: now,
		secretMaterials: {
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
		version: KEY_MANAGER_STATE_VERSION,
	};
}
