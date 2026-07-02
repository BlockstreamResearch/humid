import type {
	PortfolioData,
	PortfolioSnapshot,
} from "@/core/accounts/application/accounts-rpc/model/types";

import type { PortfolioSnapshotStore } from "./portfolioSnapshotStore";

/** The current sync target: a cache key for the selected account+chain and its scan thunk. */
export type PortfolioSyncTarget = {
	key: string;
	scan: () => Promise<PortfolioData>;
};

export type PortfolioSyncEngine = {
	/** Read the cached snapshot for the current target, triggering a throttled background sync. */
	getSnapshot: () => Promise<PortfolioSnapshot>;
};

type CacheEntry = {
	data: PortfolioData | null;
	error: string | null;
	/** Whether we've tried to hydrate this key from the durable store (once per SW lifetime). */
	hydrated: boolean;
	inFlight: boolean;
	syncedAt: number | null;
};

/** Skip starting a fresh scan if the cache was refreshed within this window (throttle). */
const MIN_SYNC_INTERVAL_MS = 60_000;

/**
 * Decouples reading the portfolio from scanning the wallet. Reads (`getSnapshot`) return the
 * cached balance for the selected account+chain immediately and kick off a background scan;
 * the heavy scan runs off the read path (and, via the worker, off the main thread). Syncs are
 * deduped (one in-flight per key) and throttled, so the popup's polling never spams scans. The
 * cache is per (account, chain), so switching back to an already-synced account is instant.
 *
 * With a `store`, the last synced snapshot is persisted and rehydrated on the first read after the
 * MV3 service worker sleeps — so reopening the popup shows the last-known balance instantly while a
 * fresh scan runs behind it, instead of a cold empty.
 */
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
			syncedAt: null,
		};
		cache.set(key, entry);

		return entry;
	};

	// Populate an empty entry from the durable store once per key (after the SW woke cold). Never
	// clobbers data a scan already produced this lifetime.
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

	const runSync = async (target: PortfolioSyncTarget): Promise<void> => {
		const entry = ensureEntry(target.key);

		if (entry.inFlight) {
			console.warn("[liquid-sync] engine skip: still in-flight", { key: target.key });

			return;
		}

		if (entry.syncedAt !== null && Date.now() - entry.syncedAt < MIN_SYNC_INTERVAL_MS) {
			console.warn("[liquid-sync] engine skip: throttled", {
				agoMs: Date.now() - entry.syncedAt,
				key: target.key,
			});

			return;
		}

		entry.inFlight = true;
		const startedAt = Date.now();

		console.warn("[liquid-sync] engine sync start", { key: target.key });

		try {
			entry.data = await target.scan();
			entry.error = null;
			entry.syncedAt = Date.now();

			// Persist the fresh snapshot so the next cold read (after the SW slept) shows it instantly.
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
		}
	};

	return {
		async getSnapshot() {
			const target = await resolveTarget();
			const entry = ensureEntry(target.key);

			// Rehydrate a cold entry from the durable store before the first read, so the popup shows
			// the last-known balance instead of empty while the fresh scan runs.
			await hydrate(target.key, entry);

			// Fire-and-forget: the read never waits on the scan (deduped + throttled inside).
			void runSync(target);

			return {
				data: entry.data,
				error: entry.error,
				isSyncing: entry.inFlight,
				syncedAt: entry.syncedAt,
			};
		},
	};
}
