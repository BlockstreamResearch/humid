import type { AnyWalletMethod } from "@/core/wallet-methods/createWalletMethodRegistry";

import type { LiquidRpcMethodContext } from "./LiquidRpcContext";
import { getLiquidBalance } from "./methods/getBalance";
import { getLiquidIdentityPublicKey } from "./methods/getIdentityPublicKey";
import { getLiquidIdentitySharedKey } from "./methods/getIdentitySharedKey";
import { getLiquidUTXOs } from "./methods/getUTXOs";
import { getLiquidWalletDescriptor } from "./methods/getWalletDescriptor";
import { processLiquidConfidentialTransaction } from "./methods/processConfidentialTransaction";
import { sendLiquidTransfer } from "./methods/sendTransfer";
import { signLiquidIdentity } from "./methods/signIdentity";
import { signLiquidMessage } from "./methods/signMessage";
import { signLiquidPset } from "./methods/signPset";

/**
 * The single source of truth for the Liquid dapp RPC surface. Each entry is a
 * self-describing wrapped method (carrying its own id, which doubles as its permission
 * id); the router derives the dispatcher and the advertised method names from this one
 * list. Adding or removing a method is a one-line edit here — nothing else to keep in
 * sync. Ordered for a sensible default order in the connect UI.
 */
export const LIQUID_RPC_METHODS: ReadonlyArray<AnyWalletMethod<LiquidRpcMethodContext>> = [
	getLiquidBalance,
	getLiquidUTXOs,
	getLiquidWalletDescriptor,
	signLiquidMessage,
	signLiquidPset,
	sendLiquidTransfer,
	getLiquidIdentityPublicKey,
	getLiquidIdentitySharedKey,
	signLiquidIdentity,
	processLiquidConfidentialTransaction,
];
