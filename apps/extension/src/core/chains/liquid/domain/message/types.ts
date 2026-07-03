import type { LiquidChainId } from "../LiquidChain";

export const LIQUID_SIGN_MESSAGE_PROTOCOLS = {
	BIP322: "bip322",
	ECDSA: "ecdsa",
} as const;

export const LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS = {
	BIP322: "bip322",
	HEX_RECOVERABLE_ECDSA_65: "hex-recoverable-ecdsa-65",
} as const;

export type LiquidSignMessageProtocol =
	(typeof LIQUID_SIGN_MESSAGE_PROTOCOLS)[keyof typeof LIQUID_SIGN_MESSAGE_PROTOCOLS];

export type LiquidSignMessageSignatureEncoding =
	(typeof LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS)[keyof typeof LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS];

export type LiquidSignMessageParams = {
	address: string;
	message: string;
	protocol?: LiquidSignMessageProtocol;
};

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

export type LiquidSignMessageResult = {
	address: string;
	messageHash?: string;
	protocol: LiquidSignMessageProtocol;
	signature: string;
	signatureEncoding: LiquidSignMessageSignatureEncoding;
};
