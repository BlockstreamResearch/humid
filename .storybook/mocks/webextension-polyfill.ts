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
