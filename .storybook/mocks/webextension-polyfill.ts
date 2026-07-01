// Storybook stub for `webextension-polyfill`.
//
// The real module throws "This script should only be loaded in a browser
// extension" at import time outside an extension, which crashes any story that
// transitively imports it (the vault client via pegasus/extension-rpc, the auth
// store via @webext-pegasus/store-zustand, background helpers, etc.). This stub
// provides an inert `browser` so those modules import cleanly in Storybook.

const noopListener = {
	addListener() {},
	removeListener() {},
	hasListener() {
		return false;
	},
};

const asyncNoop = async () => undefined;

const browser = {
	action: {
		setBadgeBackgroundColor: asyncNoop,
		setBadgeText: asyncNoop,
	},
	runtime: {
		connect: () => ({
			disconnect() {},
			name: "",
			onDisconnect: { ...noopListener },
			onMessage: { ...noopListener },
			postMessage() {},
		}),
		getManifest: () => ({}),
		getURL: (input: string) => String(input),
		id: "storybook",
		onConnect: { ...noopListener },
		onInstalled: { ...noopListener },
		onMessage: { ...noopListener },
		sendMessage: asyncNoop,
	},
	storage: {
		local: { clear: asyncNoop, get: async () => ({}), remove: asyncNoop, set: asyncNoop },
		onChanged: { ...noopListener },
		session: { clear: asyncNoop, get: async () => ({}), remove: asyncNoop, set: asyncNoop },
	},
	tabs: {
		get: asyncNoop,
		onRemoved: { ...noopListener },
		onUpdated: { ...noopListener },
		query: async () => [],
	},
	windows: {
		create: asyncNoop,
		get: asyncNoop,
		getAll: async () => [],
		getLastFocused: asyncNoop,
		onRemoved: { ...noopListener },
		remove: asyncNoop,
		update: asyncNoop,
	},
};

export default browser;
export { browser };
