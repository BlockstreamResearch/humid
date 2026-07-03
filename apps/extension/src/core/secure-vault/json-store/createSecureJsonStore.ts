import { getUnlockedSecureVaultStorage } from "../background";
import type { SecureVaultStorage } from "../types";

export type SecureJsonStore<TValue> = {
	delete: (storage?: SecureVaultStorage) => Promise<void>;
	get: (storage?: SecureVaultStorage) => Promise<TValue | null>;
	require: (storage?: SecureVaultStorage) => Promise<TValue>;
	set: (value: TValue, storage?: SecureVaultStorage) => Promise<TValue>;
	update: (
		update: (value: TValue | null) => TValue,
		storage?: SecureVaultStorage,
	) => Promise<TValue>;
};

export function createSecureJsonStore<TValue>(input: {
	key: string;
	parse: (value: unknown) => TValue;
}): SecureJsonStore<TValue> {
	return {
		delete: (storage) => resolveStorage(storage).deleteItem(input.key),
		get: async (storage) => {
			const rawValue = await resolveStorage(storage).getItem(input.key);

			if (rawValue === null) {
				return null;
			}

			return parseJsonValue(rawValue, input.parse);
		},
		require: async (storage) => {
			const value = await resolveStoreGet(storage, input);

			if (value === null) {
				throw new Error(`Secure vault item is missing: ${input.key}`);
			}

			return value;
		},
		set: async (value, storage) => {
			await resolveStorage(storage).setItem(input.key, JSON.stringify(value));

			return value;
		},
		update: async (update, storage) => {
			const currentValue = await resolveStoreGet(storage, input);
			const nextValue = update(currentValue);

			await resolveStorage(storage).setItem(input.key, JSON.stringify(nextValue));

			return nextValue;
		},
	};
}

async function resolveStoreGet<TValue>(
	storage: SecureVaultStorage | undefined,
	input: {
		key: string;
		parse: (value: unknown) => TValue;
	},
): Promise<TValue | null> {
	const rawValue = await resolveStorage(storage).getItem(input.key);

	if (rawValue === null) {
		return null;
	}

	return parseJsonValue(rawValue, input.parse);
}

function parseJsonValue<TValue>(rawValue: string, parse: (value: unknown) => TValue): TValue {
	try {
		return parse(JSON.parse(rawValue) as unknown);
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}

		throw new Error("Secure vault JSON item is invalid.", {
			cause: error,
		});
	}
}

function resolveStorage(storage: SecureVaultStorage | undefined): SecureVaultStorage {
	return storage ?? getUnlockedSecureVaultStorage();
}
