import type { PortfolioData } from "@/core/accounts/application/accounts-rpc/model/types";

import { getSessionStorage } from "./sessionStorageArea";

export type PersistedPortfolioSnapshot = {
	data: PortfolioData;
	syncedAt: number;
};

export type PortfolioSnapshotStore = {
	load: (key: string) => Promise<PersistedPortfolioSnapshot | null>;
	removeForAccountGroup: (accountGroupId: string) => Promise<void>;
	save: (key: string, snapshot: PersistedPortfolioSnapshot) => Promise<void>;
};

const STORAGE_PREFIX = "portfolio-snapshot:";

export function createSessionPortfolioSnapshotStore(): PortfolioSnapshotStore {
	const session = getSessionStorage();

	if (!session) {
		return { load: async () => null, removeForAccountGroup: async () => {}, save: async () => {} };
	}

	return {
		async load(key) {
			const storageKey = STORAGE_PREFIX + key;

			try {
				const result = await session.get(storageKey);
				const value = result[storageKey];

				return isPersistedSnapshot(value) ? value : null;
			} catch {
				return null;
			}
		},
		async removeForAccountGroup(accountGroupId) {
			const prefix = `${STORAGE_PREFIX}${accountGroupId}::`;

			try {
				const staleKeys = (await session.keys()).filter((key) => key.startsWith(prefix));

				if (staleKeys.length > 0) await session.remove(staleKeys);
			} catch {}
		},
		async save(key, snapshot) {
			try {
				await session.set({ [STORAGE_PREFIX + key]: snapshot });
			} catch {}
		},
	};
}

function isPersistedSnapshot(value: unknown): value is PersistedPortfolioSnapshot {
	if (typeof value !== "object" || value === null) return false;

	const candidate = value as { data?: unknown; syncedAt?: unknown };

	if (
		typeof candidate.syncedAt !== "number" ||
		typeof candidate.data !== "object" ||
		candidate.data === null
	) {
		return false;
	}

	const data = candidate.data as { assets?: unknown; utxos?: unknown };

	return Array.isArray(data.assets) && Array.isArray(data.utxos);
}
