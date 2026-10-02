export type LiquidSignPsetInput = {
	address: string;
	index: number;
	sighashTypes?: number[];
};

export type ParsedLiquidSignPsetInput = {
	address: string;
	index: number;
	sighashTypes: number[];
};

export type LiquidSignPsetParams = {
	broadcast?: boolean;
	pset: string;
	signInputs: LiquidSignPsetInput[];
};

export type ParsedLiquidSignPsetParams = {
	broadcast: boolean;
	pset: string;
	signInputs: ParsedLiquidSignPsetInput[];
};

export type PreparedLiquidSignPsetParams = {
	broadcast: boolean;
	preparedPset: string;
	signInputs: ParsedLiquidSignPsetInput[];
};

export type LiquidSignPsetResult = {
	pset: string;
	txid?: string;
};

export type LiquidSignPsetReview = {
	/** Serialized after wallet enrichment and blinding; this exact PSET is reviewed and signed. */
	pset: string;
	inputs: { index: number; sighashType: number }[];
	fees: { asset: string; amount: string }[];
	netEffect: { asset: string; amount: string }[];
	outputs: {
		address?: string;
		amount?: string;
		asset?: string;
		index: number;
		script: string;
	}[];
};
