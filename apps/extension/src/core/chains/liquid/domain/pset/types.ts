export type {
	LiquidSignPsetInput,
	LiquidSignPsetParams,
	LiquidSignPsetResult,
} from "@humid/wallet-rpc";

export type ParsedLiquidSignPsetInput = {
	address: string;
	index: number;
	sighashTypes: number[];
};

export type ParsedLiquidSignPsetParams = {
	broadcast: boolean;
	pset: string;
	signInputs: ParsedLiquidSignPsetInput[];
};

export type ReviewedLiquidSignPsetParams = Omit<ParsedLiquidSignPsetParams, "pset"> & {
	reviewedPset: string;
};

export type LiquidSignPsetReview = {
	/** Blinded PSET inspected for approval; signing uses this exact serialization. */
	pset: string;
	inputs: {
		amount?: string;
		asset?: string;
		index: number;
		owned: boolean;
		sighashType: number;
	}[];
	fees: { asset: string; amount: string }[];
	netEffect: { asset: string; amount: string }[];
	outputs: {
		address?: string;
		amount?: string;
		asset?: string;
		index: number;
		owned: boolean;
		script: string;
	}[];
};
