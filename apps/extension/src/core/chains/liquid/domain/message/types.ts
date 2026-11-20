import type { LiquidSignMessageProtocol } from "@humid/wallet-rpc";

import type { LiquidChainId } from "../LiquidChain";

export {
	LIQUID_SIGN_MESSAGE_PROTOCOLS,
	LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS,
} from "@humid/wallet-rpc";
export type {
	LiquidSignMessageParams,
	LiquidSignMessageProtocol,
	LiquidSignMessageResult,
	LiquidSignMessageSignatureEncoding,
} from "@humid/wallet-rpc";

export type ParsedLiquidSignMessageParams = {
	address: string;
	message: string;
	protocol: LiquidSignMessageProtocol;
};

export type LiquidSignMessageReview = {
	accountIdentifier: string;
	address: string;
	chainId: LiquidChainId;
	protocol: LiquidSignMessageProtocol;
};
