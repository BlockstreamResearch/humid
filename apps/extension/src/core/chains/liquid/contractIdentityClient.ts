import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import {
	type LiquidContractIdentityInput,
	liquidContractRpc,
} from "@/core/extension-background/internal-rpc/liquid-contract";
import { requestBackground } from "@/core/extension-rpc";

import type { LiquidContractIdentity } from "./application/contractIdentity";

/**
 * Reads the address and key contract actions are signed with, for one account.
 *
 * Popup-side only. The background holds the contract module and the key material; this
 * asks it for the two public values and nothing else.
 */
export function readLiquidContractIdentity(
	accountGroupId: AccountGroupId,
): Promise<LiquidContractIdentity> {
	return requestBackground<LiquidContractIdentity>(liquidContractRpc.methods.identity, {
		accountGroupId,
	} satisfies LiquidContractIdentityInput);
}
