const BASE_VSIZE = 121n;

const PER_WALLET_INPUT = 69n;

const PER_OUTPUT = 67n;

const PER_COVENANT_INPUT = 87n;

const PER_ISSUING_INPUT = 74n;

/**
 * What a blinded output costs beyond an open one.
 *
 * An open output is the 67 above. A blinded one also carries a rangeproof over its amount and a
 * surjection proof over its asset, both witness data, and both far larger than the output itself.
 *
 * This is deliberately generous. The number only decides how much this wallet selects: the fee
 * actually paid is worked out by the signing module from the finished transaction. Selecting a
 * little too much costs an extra input; selecting too little fails after the person has already
 * agreed to the transaction, which is the worse of the two. It has not been calibrated against
 * measured transactions and should be, once there are some to measure.
 */
const PER_BLINDED_OUTPUT = 1100n;

export type TransactionShape = {
	/** How many of `outputs` are blinded. The rest are open. */
	blindedOutputs?: number;
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
		PER_ISSUING_INPUT * BigInt(shape.issuingInputs) +
		PER_BLINDED_OUTPUT * BigInt(shape.blindedOutputs ?? 0)
	);
}

export function estimateFeeSats(shape: TransactionShape, rateSatsPerKvb: number): bigint {
	const rate = BigInt(Math.ceil(rateSatsPerKvb));
	const scaled = estimateVsize(shape) * rate;

	return scaled / 1000n + (scaled % 1000n === 0n ? 0n : 1n);
}
