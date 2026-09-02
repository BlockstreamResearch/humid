/**
 * What a transaction of a given shape weighs, and what it therefore costs.
 *
 * Every number here was measured against the real signing module rather than modelled from
 * the Elements serialisation: a transaction of each shape was built, signed and the fee it
 * was charged at 1000 sat/kvb read back, which at that rate is the vsize.
 *
 * Those measurements were taken in the completed implementation this slice is assembled from,
 * against the module that branch pins. Nothing in this slice loads a module: what is here is
 * the model those measurements came to, and the tests beside it pin its arithmetic, so a rule
 * edited by hand fails a test rather than quietly moving every fee this wallet quotes.
 *
 * Nothing here can tell whether the module still charges what it charged then. Answering that
 * means building a transaction of each shape, signing it and reading the fee back, which is
 * signing — so the calibration belongs with the signing integration, and until that lands
 * these figures are inherited rather than re-established.
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

/**
 * What an issuance adds to the input carrying it.
 *
 * A surcharge rather than an input of its own: an issuance sits on an input that is already
 * counted as a wallet or a covenant one, and adds to it the amount issued, the inflation
 * keys, the entropy and the blinding nonce.
 *
 * Measured the same way as everything else here — an ordinary wallet input, and the same
 * input carrying an issuance, both signed, and the difference in what the module charged at
 * 1000 sat/kvb. Only the wallet shape was measured. The fields belong to the input rather
 * than to its witness, so a covenant input carrying an issuance is priced the same, and that
 * is stated here rather than measured.
 */
const PER_ISSUING_INPUT = 74n;

export type TransactionShape = {
	covenantInputs: number;
	/** How many of those inputs also create an asset. Counted again rather than instead. */
	issuingInputs: number;
	outputs: number;
	walletInputs: number;
};

/** The virtual size a transaction of this shape signs to. */
export function estimateVsize(shape: TransactionShape): bigint {
	return (
		BASE_VSIZE +
		PER_WALLET_INPUT * BigInt(shape.walletInputs) +
		PER_OUTPUT * BigInt(shape.outputs) +
		PER_COVENANT_INPUT * BigInt(shape.covenantInputs) +
		PER_ISSUING_INPUT * BigInt(shape.issuingInputs)
	);
}

/**
 * The fee a transaction of this shape costs at this rate.
 *
 * Rounded up twice, and deliberately — which is one rounding more than the module does. The
 * SDK's `FinalTransaction::calculate_fee` takes the fee rate as an `f32` and computes
 * `ceil(vsize * rate / 1000)` over that fractional rate directly. This estimator takes the
 * ceiling of the per-kvb rate first and only then rounds the division up, so it is
 * `ceil(vsize * ceil(rate) / 1000)` where the module is `ceil(vsize * rate / 1000)`.
 *
 * A rate arriving with a fraction on it is the ordinary case rather than an odd one: it is
 * what dividing an endpoint's own estimate produces. So the divergence is worth stating
 * exactly. Before the final rounding to whole base units, the first ceiling adds
 * `(ceil(rate) - rate) * vsize / 1000`, and since `ceil(rate) - rate` is strictly less than 1
 * that is strictly less than `vsize / 1000` satoshis — a fraction of a satoshi per vbyte of
 * transaction, not a vbyte's worth of fee. The outer rounding then takes the whole to the next
 * satoshi, as the module's own would.
 *
 * Both roundings go the same way for the same reason: an over-estimate returns to the person
 * as change and an under-estimate is taken out of it, so the model is written to diverge from
 * the module in the direction that gives the money back.
 */
export function estimateFeeSats(shape: TransactionShape, rateSatsPerKvb: number): bigint {
	const rate = BigInt(Math.ceil(rateSatsPerKvb));
	const scaled = estimateVsize(shape) * rate;

	return scaled / 1000n + (scaled % 1000n === 0n ? 0n : 1n);
}
