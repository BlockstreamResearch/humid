import { accountsRpc } from "@/core/accounts/application/accounts-rpc/model/rpc";
import type {
	ActivityEntry,
	ActivityPage,
	GetActivityInput,
} from "@/core/accounts/application/accounts-rpc/model/types";
import { MOCK_LBTC_ID } from "@/routes/App/pages/Home/HomeContext/mockAssets";

const lbtc = (amountSats: string, timestamp: number, txid: string): ActivityEntry => ({
	changes: [{ amountSats, rawAssetId: MOCK_LBTC_ID }],
	feeSats: "250",
	timestamp,
	txid,
});

const MOCK_ACTIVITY: ActivityEntry[] = [
	lbtc("24130000", 1675296000, "aa".repeat(32)),
	lbtc("-3000000", 1673395200, "bb".repeat(32)),
	lbtc("10000000", 1672185600, "cc".repeat(32)),
];

export function requestBackground<TResponse>(method: string, data?: unknown): Promise<TResponse> {
	if (method === accountsRpc.methods.getActivity) {
		const { rawAssetId } = (data ?? {}) as GetActivityInput;
		const page: ActivityPage = {
			items: MOCK_ACTIVITY.filter(({ changes }) =>
				changes.some((change) => rawAssetId === null || change.rawAssetId === rawAssetId),
			),
			nextCursor: null,
		};

		return Promise.resolve(page as TResponse);
	}

	return Promise.reject(new Error(`requestBackground("${method}") is stubbed in Storybook.`));
}
