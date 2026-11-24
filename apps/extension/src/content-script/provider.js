import { FROM_PAGE, FROM_WALLET } from "../core/extension-background/page-port/protocol";

let nextId = 0;
const pending = new Map();
const listeners = new Map();

window.addEventListener("message", (event) => {
	if (event.source !== window || event.data?.source !== FROM_WALLET) return;

	const { error, event: name, id, payload, result } = event.data;

	if (name !== undefined) {
		for (const listener of listeners.get(name) ?? []) {
			listener({ data: payload, id: name, timestamp: Date.now() });
		}

		return;
	}

	const entry = pending.get(id);

	if (!entry) return;

	pending.delete(id);

	if (error !== undefined) entry.reject(toError(error));
	else entry.resolve(result);
});

const provider = {
	request: ({ method, params } = {}) =>
		new Promise((resolve, reject) => {
			const id = ++nextId;

			pending.set(id, { reject, resolve });
			window.postMessage({ id, method, params, source: FROM_PAGE }, "*");
		}),
	on: ({ event, listener } = {}) => {
		if (!event) throw new Error("Missing event");

		if (!listener) throw new Error("Missing listener");

		const set = listeners.get(event) ?? new Set();

		set.add(listener);
		listeners.set(event, set);

		return () => set.delete(listener);
	},
};

/**
 * Rebuilds an Error from the wire payload `{ message, code, data }`, so a dapp can classify the
 * failure, e.g. read `data.reason === "user_rejected"` to avoid retrying a declined confirmation.
 */
function toError(payload) {
	if (payload && typeof payload === "object") {
		const error = new Error(payload.message ?? "Request failed");

		if (payload.code !== undefined) error.code = payload.code;
		if (payload.data !== undefined) error.data = payload.data;

		return error;
	}

	return new Error(typeof payload === "string" ? payload : "Request failed");
}

// eslint-disable-next-line no-undef
window.humid = provider;
