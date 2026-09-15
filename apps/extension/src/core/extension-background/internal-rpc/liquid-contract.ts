import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { LiquidContractIdentity } from "@/core/chains/liquid/application/contractIdentity";

import type { RequestHandlerMap } from "../transport";

export const liquidContractRpc = {
	methods: {
		identity: "liquid.contractIdentity",
	},
} as const;

export type LiquidContractIdentityInput = { accountGroupId?: AccountGroupId };

/**
 * Reads the address and key that contract actions are signed with, for one account.
 *
 * Popup-only: the transport dispatches injected senders to a separate registry, so a
 * dapp cannot reach this. The account is named rather than assumed to be the selected
 * one, because the screen this serves is per-account and the two differ.
 */
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
