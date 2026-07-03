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

export type LiquidSignPsetResult = {
	pset: string;
	txid?: string;
};
