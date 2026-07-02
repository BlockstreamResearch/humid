import browser from "webextension-polyfill";

import type { PortfolioData } from "@/core/accounts/application/accounts-rpc/model/types";

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

/** A minimal `storage.session`-shaped area (the polyfill's types may not declare `session`). */
type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

/** `chrome.storage.session` if this context exposes it (MV3; in-memory, cleared on browser restart). */
function getSessionStorage(): SessionStorageArea | undefined {
	return (browser.storage as unknown as { session?: SessionStorageArea }).session;
}

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
