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
