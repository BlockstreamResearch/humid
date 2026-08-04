import { liquidContractRpc } from "@/core/extension-background/internal-rpc/liquid-contract";
import { requestBackground } from "@/core/extension-rpc";

import type { LiquidContractIdentity } from "./application/contractIdentity";

/**
 * Reads the address and key contract actions are signed with, for the selected account.
 *
 * Popup-side only. The background holds the contract module and the key material; this
 * asks it for the two public values and nothing else.
 */
export function readLiquidContractIdentity(): Promise<LiquidContractIdentity> {
	return requestBackground<LiquidContractIdentity>(liquidContractRpc.methods.identity);
}
