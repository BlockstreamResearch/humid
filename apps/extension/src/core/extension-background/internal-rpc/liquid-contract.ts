import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { LiquidContractIdentity } from "@/core/chains/liquid/application/contractIdentity";

import type { RequestHandlerMap } from "../transport";

export const liquidContractRpc = {
	methods: {
		identity: "liquid.contractIdentity",
	},
} as const;

export type LiquidContractIdentityInput = { accountGroupId?: AccountGroupId };

export function createLiquidContractInternalHandlers(
	readContractIdentity: (accountGroupId?: AccountGroupId) => Promise<LiquidContractIdentity>,
): RequestHandlerMap {
	return {
		[liquidContractRpc.methods.identity]: (message) =>
			readContractIdentity(
				(message.data as LiquidContractIdentityInput | undefined)?.accountGroupId,
			),
	};
}
