// Storybook stub for "@/core/extension-rpc".
//
// The real module calls definePegasusMessageBus() at import time, which throws
// "Messaging API wasn't set" outside a browser extension — crashing any story that
// transitively imports a client (chainsClient, etc.). Stories drive the UI with
// mock data (MockHomeProvider), so requestBackground should never run; reject
// loudly if something reaches it.

export function requestBackground<TResponse>(method: string): Promise<TResponse> {
	return Promise.reject(new Error(`requestBackground("${method}") is stubbed in Storybook.`));
}
