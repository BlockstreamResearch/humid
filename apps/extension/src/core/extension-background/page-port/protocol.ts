/** The port a page's content script opens to reach the wallet. */
export const PAGE_PORT_NAME = "humid-page";

/** Tags on window messages between the injected provider and its content script. */
export const FROM_PAGE = "humid-page";
export const FROM_WALLET = "humid-wallet";

export type PageRequest = { id: number | string; method: string; params?: unknown };

export type WalletReply =
	| { error: unknown; id: number | string }
	| { id: number | string; result: unknown }
	| { event: string; payload: unknown };

export function parsePageRequest(value: unknown): PageRequest | null {
	if (typeof value !== "object" || value === null) return null;

	const { id, method, params } = value as Record<string, unknown>;

	if (typeof method !== "string" || (typeof id !== "number" && typeof id !== "string")) return null;

	return { id, method, params };
}
