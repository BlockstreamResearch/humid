import { accountsRpc } from "@/core/accounts/application/accounts-rpc/model/rpc";
import type {
	ActivityPage,
	GetActivityInput,
} from "@/core/accounts/application/accounts-rpc/model/types";

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
