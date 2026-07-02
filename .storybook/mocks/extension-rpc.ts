// Storybook stub for "@/core/extension-rpc".
//
// The real module calls definePegasusMessageBus() at import time, which throws
// "Messaging API wasn't set" outside a browser extension — crashing any story that
// transitively imports a client (chainsClient, etc.). Stories drive the UI with
// mock data (MockHomeProvider), so requestBackground should never run — with one
// exception: the asset screen fetches its activity through the real client, so we
// answer that one method with canned data and reject everything else loudly.

import { accountsRpc } from "@/core/accounts/application/accounts-rpc/model/rpc";
import type {
	ActivityPage,
	GetActivityInput,
} from "@/core/accounts/application/accounts-rpc/model/types";

// Canned per-asset activity for the Asset story (the real background is absent here).
const MOCK_ACTIVITY: Record<string, ActivityPage> = {
	lbtc: {
		items: [
			{
				amountSats: "24130000",
				direction: "received",
				timestamp: 1675296000,
				txid: "aa".repeat(32),
			},
			{ amountSats: "3000000", direction: "sent", timestamp: 1673395200, txid: "bb".repeat(32) },
			{
				amountSats: "10000000",
				direction: "received",
				timestamp: 1672185600,
				txid: "cc".repeat(32),
			},
		],
		nextCursor: null,
	},
};

export function requestBackground<TResponse>(method: string, data?: unknown): Promise<TResponse> {
	if (method === accountsRpc.methods.getActivity) {
		const { rawAssetId } = (data ?? {}) as GetActivityInput;

		return Promise.resolve(
			(MOCK_ACTIVITY[rawAssetId] ?? { items: [], nextCursor: null }) as TResponse,
		);
	}

	return Promise.reject(new Error(`requestBackground("${method}") is stubbed in Storybook.`));
}
