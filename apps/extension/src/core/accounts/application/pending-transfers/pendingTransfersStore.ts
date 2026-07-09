import browser from "webextension-polyfill";

/**
 * One optimistic "sent" transfer, tracked from the moment it's broadcast until the next chain scan
 * catches it. Direction is always "sent" (only our own sends are recorded). `amountSats` stays a
 * base-unit string here — the store is the one place that holds the amount as a string, mirroring
 * the RPC boundary; the activity merge parses it to bigint at read time and only formats at render.
 */
export type PendingTransfer = {
	amountSats: string;
	createdAt: number;
	rawAssetId: string;
	txid: string;
};

/**
 * Loads/updates the optimistic pending-transfer list for one (account, chain). Mirrors the portfolio
 * snapshot store's convention: backed by `chrome.storage.session` (in-memory, survives service-worker
 * sleeps, cleared on browser restart, reachable only from trusted contexts), namespaced by a key
 * prefix, best-effort (a failed read/write degrades gracefully), and shape-checked on read. Falls back
 * to a no-op when session storage is unavailable (Firefox / older Chrome) — then no optimistic entry
 * is shown and the wallet simply waits for the scan, exactly like the snapshot store's fallback.
 */
export type PendingTransfersStore = {
	/** Prepend a just-broadcast transfer (idempotent by txid, so a double-record is a no-op). */
	add: (storageKey: string, entry: PendingTransfer) => Promise<void>;
	load: (storageKey: string) => Promise<PendingTransfer[]>;
	/** Drop one transfer once a scan has caught it (a no-op when the txid isn't tracked). */
	remove: (storageKey: string, txid: string) => Promise<void>;
};

const STORAGE_PREFIX = "pending-transfers:";

/**
 * The `chrome.storage.session` key holding one (account, chain)'s pending list — matches the
 * `${accountGroupId}::${chainId}` snapshot convention. Exported so the reactive hook can filter
 * `storage.onChanged` events down to just this entry.
 */
export function pendingTransfersStorageKey(accountGroupId: string, chainId: string): string {
	return `${STORAGE_PREFIX}${accountGroupId}::${chainId}`;
}

/** A minimal `storage.session`-shaped area (the polyfill's types may not declare `session`). */
type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	remove: (key: string) => Promise<void>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

/** `chrome.storage.session` if this context exposes it (MV3), else undefined (then: no persistence). */
function getSessionStorage(): SessionStorageArea | undefined {
	return (browser.storage as unknown as { session?: SessionStorageArea }).session;
}

/**
 * A pending-transfers store backed by `chrome.storage.session`. Reads and writes are best-effort and
 * self-healing: a corrupt entry is dropped, an empty list clears its key, and add/remove skip the
 * write when nothing actually changed (so the reconcile GC can't storm `storage.onChanged`).
 */
export function createSessionPendingTransfersStore(): PendingTransfersStore {
	const session = getSessionStorage();

	if (!session) {
		return { add: async () => {}, load: async () => [], remove: async () => {} };
	}

	const read = async (storageKey: string): Promise<PendingTransfer[]> => {
		try {
			const result = await session.get(storageKey);
			const value = result[storageKey];

			return Array.isArray(value) ? value.filter(isPendingTransfer) : [];
		} catch {
			return [];
		}
	};

	const write = async (storageKey: string, entries: PendingTransfer[]): Promise<void> => {
		try {
			if (entries.length === 0) await session.remove(storageKey);
			else await session.set({ [storageKey]: entries });
		} catch {
			// Best-effort: a failed persist just means no optimistic row until the scan lands.
		}
	};

	return {
		async add(storageKey, entry) {
			const entries = await read(storageKey);

			// Idempotent: a re-broadcast / double-record of the same txid must not duplicate the row.
			if (entries.some((candidate) => candidate.txid === entry.txid)) return;

			await write(storageKey, [entry, ...entries]);
		},
		load: read,
		async remove(storageKey, txid) {
			const entries = await read(storageKey);
			const next = entries.filter((candidate) => candidate.txid !== txid);

			// Nothing tracked under this txid — skip the write so we don't fire a no-op change event.
			if (next.length === entries.length) return;

			await write(storageKey, next);
		},
	};
}

/** Shape-check one entry read back from storage (defends against corruption / schema drift). */
function isPendingTransfer(value: unknown): value is PendingTransfer {
	if (typeof value !== "object" || value === null) return false;

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.amountSats === "string" &&
		typeof candidate.createdAt === "number" &&
		typeof candidate.rawAssetId === "string" &&
		typeof candidate.txid === "string"
	);
}
