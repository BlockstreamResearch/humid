import type {
	PortfolioData,
	PortfolioSnapshot,
} from "@/core/accounts/application/accounts-rpc/model/types";

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
 */
export function createPortfolioSyncEngine(
	resolveTarget: () => Promise<PortfolioSyncTarget>,
): PortfolioSyncEngine {
	const cache = new Map<string, CacheEntry>();

	const ensureEntry = (key: string): CacheEntry => {
		const existing = cache.get(key);

		if (existing) return existing;

		const entry: CacheEntry = { data: null, error: null, inFlight: false, syncedAt: null };
		cache.set(key, entry);

		return entry;
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
