const BASE_VSIZE = 121n;

const PER_WALLET_INPUT = 69n;

const PER_OUTPUT = 67n;

const PER_COVENANT_INPUT = 87n;

const PER_ISSUING_INPUT = 74n;

export type TransactionShape = {
	covenantInputs: number;
	issuingInputs: number;
	outputs: number;
	walletInputs: number;
};

export function estimateVsize(shape: TransactionShape): bigint {
	return (
		BASE_VSIZE +
		PER_WALLET_INPUT * BigInt(shape.walletInputs) +
		PER_OUTPUT * BigInt(shape.outputs) +
		PER_COVENANT_INPUT * BigInt(shape.covenantInputs) +
		PER_ISSUING_INPUT * BigInt(shape.issuingInputs)
	);
}

export function estimateFeeSats(shape: TransactionShape, rateSatsPerKvb: number): bigint {
	const rate = BigInt(Math.ceil(rateSatsPerKvb));
	const scaled = estimateVsize(shape) * rate;

	return scaled / 1000n + (scaled % 1000n === 0n ? 0n : 1n);
}
