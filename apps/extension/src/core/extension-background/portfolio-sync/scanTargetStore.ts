import { getSessionStorage } from "./sessionStorageArea";

/** The last-active scan target: which snapshot key it feeds, plus the chain-specific scan payload. */
export type ActiveScanTarget<T> = {
	key: string;
	target: T;
};

/** Persists the last-active watch-only scan target so a background refresh can scan without the vault. */
export type ScanTargetStore<T> = {
	load: () => Promise<ActiveScanTarget<T> | null>;
	save: (key: string, target: T) => Promise<void>;
};

const STORAGE_KEY = "portfolio-active-scan-target";

/**
 * Session-backed store for the single most-recently-scanned target (`{ key, target }`). The popup's
 * unlocked scan writes it; the background alarm reads it to refresh that one account without the
 * vault (the target is watch-only). In-memory (survives SW sleep), cleared on browser restart.
 * No-op when session storage is unavailable. The `target` payload shape is the caller's concern.
 */
export function createSessionScanTargetStore<T>(): ScanTargetStore<T> {
	const session = getSessionStorage();

	if (!session) {
		return { load: async () => null, save: async () => {} };
	}

	return {
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
			} catch {
				// Best-effort: a failed persist just means the next background refresh has nothing to do.
			}
		},
	};
}

/** Shape-check the envelope read back from storage (the `target` payload is validated by the caller). */
function isActiveScanTarget(value: unknown): value is ActiveScanTarget<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { key?: unknown }).key === "string" &&
		"target" in value
	);
}
