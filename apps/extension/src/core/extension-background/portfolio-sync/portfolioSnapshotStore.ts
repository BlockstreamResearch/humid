import type { PortfolioData } from "@/core/accounts/application/accounts-rpc/model/types";

import { getSessionStorage } from "./sessionStorageArea";

/** A persisted portfolio snapshot: the last synced data and when it synced. */
export type PersistedPortfolioSnapshot = {
	data: PortfolioData;
	syncedAt: number;
};

/** Loads/saves the last synced portfolio per (account, chain) key, to survive service-worker sleep. */
export type PortfolioSnapshotStore = {
	load: (key: string) => Promise<PersistedPortfolioSnapshot | null>;
	/** Purge every chain's persisted snapshot for one account group (garbage-collect on removal). */
	removeForAccountGroup: (accountGroupId: string) => Promise<void>;
	save: (key: string, snapshot: PersistedPortfolioSnapshot) => Promise<void>;
};

const STORAGE_PREFIX = "portfolio-snapshot:";

/**
 * A portfolio snapshot store backed by `chrome.storage.session`: it survives service-worker sleeps
 * (so reopening the popup is instant) but is cleared when the browser restarts — so balances are
 * always re-scanned fresh across sessions and nothing lands on disk. Falls back to a no-op when
 * session storage is unavailable, so the engine simply runs in-memory only.
 */
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
			// Snapshots are keyed `portfolio-snapshot:${accountGroupId}::${chainId}`, so a prefix match
			// purges every chain's snapshot for this account without enumerating the chains.
			const prefix = `${STORAGE_PREFIX}${accountGroupId}::`;

			try {
				const staleKeys = (await session.keys()).filter((key) => key.startsWith(prefix));

				if (staleKeys.length > 0) await session.remove(staleKeys);
			} catch {
				// Best-effort: any leftover snapshot is re-scanned as stale and cleared on browser restart.
			}
		},
		async save(key, snapshot) {
			try {
				await session.set({ [STORAGE_PREFIX + key]: snapshot });
			} catch {
				// Best-effort: a failed persist just means the next cold open re-scans from empty.
			}
		},
	};
}

/**
 * Shape-check a value read back from storage (defends against schema drift / corruption). Both
 * `assets` and `utxos` must be arrays: HUMID needs no migrations (pre-beta), so a snapshot written
 * before `utxos` existed is simply rejected here and re-scanned from empty — cheaper and sounder
 * than back-filling, and the session store is cleared on browser restart anyway.
 */
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
