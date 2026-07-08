import browser from "webextension-polyfill";

/**
 * A minimal `storage.session`-shaped area (the polyfill's types may not declare `session`), extended
 * with `keys()`/`remove()` so callers can enumerate and purge stored entries (e.g. a removed
 * account's snapshots).
 */
export type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	keys: () => Promise<string[]>;
	remove: (keys: string[]) => Promise<void>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

/** The raw `chrome.storage.session` surface adapted below (`get(null)` returns every stored entry). */
type RawSessionStorageArea = {
	get: (keys?: string | null) => Promise<Record<string, unknown>>;
	remove: (keys: string[]) => Promise<void>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

/**
 * `chrome.storage.session` if this context exposes it (MV3): in-memory, survives service-worker
 * sleeps, cleared on browser restart, and (default) reachable only from trusted contexts. Undefined
 * on Firefox / older Chrome, where callers fall back to no persistence. Adapts the raw area to add a
 * derived `keys()` helper (there is no native key-listing call).
 */
export function getSessionStorage(): SessionStorageArea | undefined {
	const session = (browser.storage as unknown as { session?: RawSessionStorageArea }).session;

	if (!session) return undefined;

	return {
		get: (key) => session.get(key),
		keys: async () => Object.keys(await session.get(null)),
		remove: (keys) => session.remove(keys),
		set: (items) => session.set(items),
	};
}
