import browser from "webextension-polyfill";

export type PendingTransfer = {
	amountSats: string;
	createdAt: number;
	rawAssetId: string;
	txid: string;
};

export type PendingTransfersStore = {
	add: (storageKey: string, entry: PendingTransfer) => Promise<void>;
	load: (storageKey: string) => Promise<PendingTransfer[]>;
	remove: (storageKey: string, txid: string) => Promise<void>;
};

const STORAGE_PREFIX = "pending-transfers:";

export function pendingTransfersStorageKey(accountGroupId: string, chainId: string): string {
	return `${STORAGE_PREFIX}${accountGroupId}::${chainId}`;
}

type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	remove: (key: string) => Promise<void>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

function getSessionStorage(): SessionStorageArea | undefined {
	return (browser.storage as unknown as { session?: SessionStorageArea }).session;
}

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
		} catch {}
	};

	return {
		async add(storageKey, entry) {
			const entries = await read(storageKey);

			if (entries.some((candidate) => candidate.txid === entry.txid)) return;

			await write(storageKey, [entry, ...entries]);
		},
		load: read,
		async remove(storageKey, txid) {
			const entries = await read(storageKey);
			const next = entries.filter((candidate) => candidate.txid !== txid);

			if (next.length === entries.length) return;

			await write(storageKey, next);
		},
	};
}

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
