import type { CreateLocalRootKeyManagerStateInput, KeyManagerState } from "../types";
import { KEY_MANAGER_STATE_VERSION, LOCAL_ROOT_KEYRING_TYPE } from "./constants";

export function createLocalRootKeyManagerState(
	input: CreateLocalRootKeyManagerStateInput,
): KeyManagerState {
	const seedMaterial = input.seedMaterial.trim();

	if (!seedMaterial) {
		throw new Error("Missing seed material");
	}

	const now = input.createdAt ?? Date.now();
	const keyringId = input.keyringId ?? createId("keyring");

	return {
		accounts: [],
		createdAt: now,
		keyrings: [
			{
				accounts: [],
				createdAt: now,
				id: keyringId,
				material: {
					encoding: "utf8",
					kind: "seed",
					value: seedMaterial,
				},
				metadata: {
					source: input.source ?? "generated",
				},
				name: input.name ?? "Local root",
				type: LOCAL_ROOT_KEYRING_TYPE,
				updatedAt: now,
			},
		],
		updatedAt: now,
		version: KEY_MANAGER_STATE_VERSION,
	};
}

function createId(prefix: string): string {
	return `${prefix}:${crypto.randomUUID()}`;
}
