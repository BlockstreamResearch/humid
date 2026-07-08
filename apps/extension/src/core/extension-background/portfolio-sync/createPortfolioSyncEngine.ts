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
	/**
	 * Force an immediate re-sync of the current target — bypasses the throttle but still
	 * single-flights (joins an in-flight scan) — and resolve with the fresh snapshot.
	 */
	refresh: () => Promise<PortfolioSnapshot>;
};

type CacheEntry = {
	data: PortfolioData | null;
	error: string | null;
	/** Whether we've tried to hydrate this key from the durable store (once per SW lifetime). */
	hydrated: boolean;
	inFlight: boolean;
	/** The in-flight scan promise, shared so concurrent reads/refreshes single-flight onto it. */
	inFlightSync: Promise<void> | null;
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
			inFlightSync: null,
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

	/**
	 * Kick a sync for `target`, resolving when the wallet scan settles.
	 *
	 * Single-flight: if a scan is already running for this key, EVERY caller (a background read or a
	 * forced refresh) joins that same in-flight promise instead of starting a second concurrent scan
	 * — so rapid refresh clicks collapse to one wallet scan.
	 *
	 * Throttle: an unforced sync is skipped when the cache was refreshed within `MIN_SYNC_INTERVAL_MS`.
	 * `force` bypasses ONLY this time throttle — never the single-flight guard above — so a manual
	 * refresh always re-scans now, yet still can't launch a duplicate scan.
	 */
	const runSync = (target: PortfolioSyncTarget, options?: { force?: boolean }): Promise<void> => {
		const entry = ensureEntry(target.key);

		// Single-flight: join the scan already in progress for this key (forced or not).
		if (entry.inFlightSync) return entry.inFlightSync;

		if (
			!options?.force &&
			entry.syncedAt !== null &&
			Date.now() - entry.syncedAt < MIN_SYNC_INTERVAL_MS
		) {
			console.warn("[liquid-sync] engine skip: throttled", {
				agoMs: Date.now() - entry.syncedAt,
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
				entry.inFlightSync = null;
			}
		})();

		// Publish the in-flight promise before returning so the next caller single-flights onto it.
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
		async getSnapshot() {
			const target = await resolveTarget();
			const entry = ensureEntry(target.key);

			// Rehydrate a cold entry from the durable store before the first read, so the popup shows
			// the last-known balance instead of empty while the fresh scan runs.
			await hydrate(target.key, entry);

			// Fire-and-forget: the read never waits on the scan (single-flighted + throttled inside).
			void runSync(target);

			return snapshotOf(entry);
		},
		async refresh() {
			const target = await resolveTarget();
			const entry = ensureEntry(target.key);

			await hydrate(target.key, entry);

			// Await the forced scan so the returned snapshot is the fresh one; `force` bypasses the
			// time throttle while `runSync` still single-flights (joins any in-flight scan).
			await runSync(target, { force: true });

			return snapshotOf(entry);
		},
	};
}
