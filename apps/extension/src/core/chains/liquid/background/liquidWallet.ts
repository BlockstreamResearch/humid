import type { CreateInternalRpcHandlersInput } from "@/core/extension-background/internal-rpc";

import { sentTransactions } from "../adapters/lwk/wallet/sentTransactions";
import { transactionLabels } from "../application/transactionLabels";
import type { LiquidChainGroup } from "../contract";
import type { LiquidAccounts } from "./liquidAccounts";

export function createLiquidWallet(
	{ accountRuntime }: LiquidChainGroup,
	accounts: LiquidAccounts,
): Pick<
	CreateInternalRpcHandlersInput,
	| "estimateMaxSend"
	| "getActivity"
	| "getReceiveAddress"
	| "inspectTransfer"
	| "listHeldTransactions"
	| "releaseHeldTransaction"
	| "sendTransfer"
> {
	const selectedInput = async () => (await accounts.selected()).input;

	return {
		estimateMaxSend: async (input) => accountRuntime.estimateMaxSend(await selectedInput(), input),

		async getActivity({ cursor, rawAssetId }) {
			const [page, labels] = await Promise.all([
				accountRuntime.getActivity(await selectedInput(), rawAssetId, cursor),
				transactionLabels.read(),
			]);

			return {
				...page,
				items: page.items.map((item) =>
					labels[item.txid] === undefined ? item : { ...item, label: labels[item.txid] },
				),
			};
		},

		getReceiveAddress: async () => accountRuntime.getReceiveAddress(await selectedInput()),

		inspectTransfer: async (input) => accountRuntime.inspectTransfer(await selectedInput(), input),

		async listHeldTransactions() {
			const { accountGroupId, input } = await accounts.selected();

			return sentTransactions.signedFor(input.chain, accountGroupId);
		},

		releaseHeldTransaction: async (txid) => sentTransactions.release(txid),

		sendTransfer: async (input) => accountRuntime.sendTransfer(await selectedInput(), input),
	};
}
