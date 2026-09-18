import browser from "webextension-polyfill";

export type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	keys: () => Promise<string[]>;
	remove: (keys: string[]) => Promise<void>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

type RawSessionStorageArea = {
	get: (keys?: string | null) => Promise<Record<string, unknown>>;
	remove: (keys: string[]) => Promise<void>;
	set: (items: Record<string, unknown>) => Promise<void>;
};

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
