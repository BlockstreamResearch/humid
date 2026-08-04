import type { LiquidContractIdentity } from "@/core/chains/liquid/application/contractIdentity";

import type { RequestHandlerMap } from "../transport";

export const liquidContractRpc = {
	methods: {
		identity: "liquid.contractIdentity",
	},
} as const;

/**
 * Reads the address and key that contract actions are signed with, for the selected
 * account. Popup-only: the transport dispatches injected senders to a separate
 * registry, so a dapp cannot reach this.
 */
export function createLiquidContractInternalHandlers(
	readContractIdentity: () => Promise<LiquidContractIdentity>,
): RequestHandlerMap {
	return {
		[liquidContractRpc.methods.identity]: () => readContractIdentity(),
	};
}
