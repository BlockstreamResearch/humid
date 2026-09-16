import type {
	PortfolioData,
	PortfolioSnapshot,
} from "@/core/accounts/application/accounts-rpc/model/types";

import type { PortfolioSnapshotStore } from "./portfolioSnapshotStore";

export type PortfolioSyncTarget = {
	key: string;
	scan: () => Promise<PortfolioData>;
};

export type PortfolioSyncEngine = {
	getSnapshot: () => Promise<PortfolioSnapshot>;
	refresh: () => Promise<PortfolioSnapshot>;
	isSyncing: (key: string) => boolean;
};

type CacheEntry = {
	data: PortfolioData | null;
	error: string | null;
	hydrated: boolean;
	inFlight: boolean;
	inFlightSync: Promise<void> | null;
	lastAttemptAt: number | null;
	syncedAt: number | null;
};

const MIN_SYNC_INTERVAL_MS = 60_000;

export function createPortfolioSyncEngine(
	resolveTarget: () => Promise<PortfolioSyncTarget>,
	store?: PortfolioSnapshotStore,
): PortfolioSyncEngine {
	const cache = new Map<string, CacheEntry>();

	const ensureEntry = (key: string): CacheEntry => {
		const existing = cache.get(key);

		if (existing) return existing;

		const entry: CacheEntry = {
			data: null,
			error: null,
			hydrated: false,
			inFlight: false,
			inFlightSync: null,
			lastAttemptAt: null,
			syncedAt: null,
		};
		cache.set(key, entry);

		return entry;
	};

	const hydrate = async (key: string, entry: CacheEntry): Promise<void> => {
		if (entry.hydrated || !store) return;

		entry.hydrated = true;

		if (entry.data !== null) return;

		const persisted = await store.load(key);

		if (persisted && entry.data === null) {
			entry.data = persisted.data;
			entry.syncedAt = persisted.syncedAt;
		}
	};

	const runSync = (target: PortfolioSyncTarget, options?: { force?: boolean }): Promise<void> => {
		const entry = ensureEntry(target.key);

		if (entry.inFlightSync) return entry.inFlightSync;

		if (
			!options?.force &&
			entry.lastAttemptAt !== null &&
			Date.now() - entry.lastAttemptAt < MIN_SYNC_INTERVAL_MS
		) {
			console.warn("[liquid-sync] engine skip: throttled", {
				agoMs: Date.now() - entry.lastAttemptAt,
				key: target.key,
			});

			return Promise.resolve();
		}

		entry.inFlight = true;
		const startedAt = Date.now();

		console.warn("[liquid-sync] engine sync start", {
			forced: options?.force === true,
			key: target.key,
		});

		const sync = (async () => {
			try {
				entry.data = await target.scan();
				entry.error = null;
				entry.syncedAt = Date.now();

				void store?.save(target.key, { data: entry.data, syncedAt: entry.syncedAt });

				console.warn("[liquid-sync] engine sync ok", {
					key: target.key,
					ms: Date.now() - startedAt,
				});
			} catch (cause) {
				entry.error = cause instanceof Error ? cause.message : String(cause);

				console.error("[liquid-sync] engine sync failed", {
					error: entry.error,
					key: target.key,
					ms: Date.now() - startedAt,
				});
			} finally {
				entry.inFlight = false;
				entry.inFlightSync = null;
				entry.lastAttemptAt = Date.now();
			}
		})();

		entry.inFlightSync = sync;

		return sync;
	};

	const snapshotOf = (entry: CacheEntry): PortfolioSnapshot => ({
		data: entry.data,
		error: entry.error,
		isSyncing: entry.inFlight,
		syncedAt: entry.syncedAt,
	});

	return {
		isSyncing(key) {
			return cache.get(key)?.inFlight === true;
		},
		async getSnapshot() {
			const target = await resolveTarget();
			const entry = ensureEntry(target.key);

			await hydrate(target.key, entry);

			void runSync(target);

			return snapshotOf(entry);
		},
		async refresh() {
			const target = await resolveTarget();
			const entry = ensureEntry(target.key);

			await hydrate(target.key, entry);

			await runSync(target, { force: true });

			return snapshotOf(entry);
		},
	};
}
