import browser from "webextension-polyfill";

/** A minimal `storage.session`-shaped area (the polyfill's types may not declare `session`). */
export type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

/**
 * `chrome.storage.session` if this context exposes it (MV3): in-memory, survives service-worker
 * sleeps, cleared on browser restart, and (default) reachable only from trusted contexts. Undefined
 * on Firefox / older Chrome, where callers fall back to no persistence.
 */
export function getSessionStorage(): SessionStorageArea | undefined {
	return (browser.storage as unknown as { session?: SessionStorageArea }).session;
}
