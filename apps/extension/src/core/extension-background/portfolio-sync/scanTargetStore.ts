import { getSessionStorage } from "./sessionStorageArea";

export type ActiveScanTarget<T> = {
	key: string;
	target: T;
};

export type ScanTargetStore<T> = {
	clear: () => Promise<void>;
	load: () => Promise<ActiveScanTarget<T> | null>;
	save: (key: string, target: T) => Promise<void>;
};

const STORAGE_KEY = "portfolio-active-scan-target";

export function createSessionScanTargetStore<T>(): ScanTargetStore<T> {
	const session = getSessionStorage();

	if (!session) {
		return { clear: async () => {}, load: async () => null, save: async () => {} };
	}

	return {
		async clear() {
			try {
				await session.remove([STORAGE_KEY]);
			} catch {}
		},
		async load() {
			try {
				const result = await session.get(STORAGE_KEY);
				const value = result[STORAGE_KEY];

				return isActiveScanTarget(value) ? (value as ActiveScanTarget<T>) : null;
			} catch {
				return null;
			}
		},
		async save(key, target) {
			try {
				await session.set({ [STORAGE_KEY]: { key, target } });
			} catch {}
		},
	};
}

function isActiveScanTarget(value: unknown): value is ActiveScanTarget<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { key?: unknown }).key === "string" &&
		"target" in value
	);
}
