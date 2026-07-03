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
		return { load: async () => null, save: async () => {} };
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
		async save(key, snapshot) {
			try {
				await session.set({ [STORAGE_PREFIX + key]: snapshot });
			} catch {
				// Best-effort: a failed persist just means the next cold open re-scans from empty.
			}
		},
	};
}

/** Shape-check a value read back from storage (defends against schema drift / corruption). */
function isPersistedSnapshot(value: unknown): value is PersistedPortfolioSnapshot {
	if (typeof value !== "object" || value === null) return false;

	const candidate = value as { data?: unknown; syncedAt?: unknown };

	return (
		typeof candidate.syncedAt === "number" &&
		typeof candidate.data === "object" &&
		candidate.data !== null &&
		Array.isArray((candidate.data as { assets?: unknown }).assets)
	);
}
