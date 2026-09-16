import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import {
	type LiquidContractIdentityInput,
	liquidContractRpc,
} from "@/core/extension-background/internal-rpc/liquid-contract";
import { requestBackground } from "@/core/extension-rpc";

import type { LiquidContractIdentity } from "./application/contractIdentity";

export function readLiquidContractIdentity(
	accountGroupId: AccountGroupId,
): Promise<LiquidContractIdentity> {
	return requestBackground<LiquidContractIdentity>(liquidContractRpc.methods.identity, {
		accountGroupId,
	} satisfies LiquidContractIdentityInput);
}
