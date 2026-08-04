/**
 * What a transaction of a given shape weighs, and what it therefore costs.
 *
 * Every number here was measured against the real signing module rather than modelled from
 * the Elements serialisation: a transaction of each shape was built, signed and the fee it
 * was charged at 1000 sat/kvb read back, which at that rate is the vsize. The measurements
 * are standing tests, so a toolchain change that moves them fails the suite instead of
 * quietly moving every fee.
 *
 * **The runtime's figure cannot equal the one that is charged.** smplx does not estimate a
 * fee; it signs the transaction and weighs the result. Signing before the person has agreed
 * is what the confirmation exists to prevent, so before approval there is a model and after
 * it there is a measurement, and they differ. What makes that safe is where the difference
 * goes: smplx sets change to whatever is left after its own fee, so an over-estimate returns
 * to the person as change and an under-estimate is absorbed by a larger fee. The transaction
 * balances either way.
 *
 * The one case that is not absorbed is an output whose amount is a function of the fee. It
 * is computed against this figure and the chain charges the other, and the difference lands
 * in change. A covenant that asserts the exact relationship rejects that — and rejects it at
 * signing, where the program is executed against the witness actually produced, so it
 * surfaces as a refusal rather than as a wrong payment.
 */

/** The fixed part: the change and fee outputs smplx adds, and the transaction's own header. */
const BASE_VSIZE = 121n;

/** A wallet input, spending a P2WPKH output the wallet owns. */
const PER_WALLET_INPUT = 69n;

/** An output the action declares. */
const PER_OUTPUT = 67n;

/**
 * A covenant input, measured on `p2pk` — one signature check and nothing else.
 *
 * This is the number that belongs to the program rather than to the shape: a covenant
 * input's witness is the Simplicity witness, and a larger contract carries a larger one.
 * p2pk is the smallest real covenant there is, so this under-states every other one, which
 * is why an action that references the fee is worth treating as approximate rather than
 * exact.
 */
const PER_COVENANT_INPUT = 87n;

export type TransactionShape = {
	covenantInputs: number;
	outputs: number;
	walletInputs: number;
};

/** The virtual size a transaction of this shape signs to. */
export function estimateVsize(shape: TransactionShape): bigint {
	return (
		BASE_VSIZE +
		PER_WALLET_INPUT * BigInt(shape.walletInputs) +
		PER_OUTPUT * BigInt(shape.outputs) +
		PER_COVENANT_INPUT * BigInt(shape.covenantInputs)
	);
}

/**
 * The fee a transaction of this shape costs at this rate.
 *
 * Rounded up, matching `calculate_fee` in the SDK, which is `ceil(vsize * rate / 1000)`.
 */
export function estimateFeeSats(shape: TransactionShape, rateSatsPerKvb: number): bigint {
	const rate = BigInt(Math.ceil(rateSatsPerKvb));
	const scaled = estimateVsize(shape) * rate;

	return scaled / 1000n + (scaled % 1000n === 0n ? 0n : 1n);
}
