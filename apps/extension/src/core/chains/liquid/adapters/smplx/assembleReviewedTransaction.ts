import type { ManifestReview } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

/** A transaction that has been balanced, blinded, signed and finalised, as plain facts. */
export type AssembledTransaction = {
	feeSats: bigint;
	hex: string;
	txid: string;
};

/**
 * The transaction under assembly, as this module drives it.
 *
 * Named rather than taken from the module's own type so what is used is visible: this adds
 * inputs and outputs and nothing else. Everything that needs a key happens on the other side
 * of `FinalizeTransaction`.
 */
export type AssemblingBuilder = InstanceType<SmplxWasmModule["TransactionBuilder"]>;

/**
 * Turns an assembled transaction into a finished one.
 *
 * A seam rather than a step, because the real one blinds, signs and finalises in a single
 * atomic call on a signer built from a mnemonic. Whoever holds that credential owns this
 * function; this module never acquires one, so it can assemble a transaction without being
 * able to sign it — which is what makes assembly reviewable on its own.
 *
 * It also owns whatever the module hands back: the finished transaction is a handle across
 * the wasm boundary, and only the caller that made it knows when it is done with it.
 */
export type FinalizeTransaction = (
	builder: AssemblingBuilder,
	feeRateSatsPerKvb: number,
) => AssembledTransaction | Promise<AssembledTransaction>;

export type AssembleResult =
	| { ok: false; reason: string }
	| { ok: true; transaction: AssembledTransaction };

/**
 * Builds the transaction from the plan the review settled, and hands it to the caller's
 * finalizer.
 *
 * Everything the document decides comes from the review: which of the wallet's outputs fund
 * this, what each output pays and in which asset, and at what rate the fee is worked out.
 * This interprets none of it — a module that re-read the document here would be building
 * something nobody was shown.
 *
 * Where change goes is the one fact that does not come from there, and is passed in beside
 * it. A site has no say in it and a review has no business carrying it: it is the wallet's
 * own address, and only the caller knows which one. Left unset the module returns change to
 * whichever address the signer happens to derive, which is a wallet-owned decision made
 * somewhere the wallet cannot see — so it is stated rather than defaulted.
 *
 * The builder is a handle across the wasm boundary and is released on every path, including
 * the ones where an input the module will not take throws part-way through and the one where
 * the finalizer itself fails. Left to a collector that does not know it holds wasm memory,
 * a refused action leaks a transaction.
 */
export async function assembleReviewedTransaction(
	review: ManifestReview,
	input: {
		/**
		 * Where this transaction's change goes, as a script rather than an address.
		 *
		 * The wallet's own, supplied by the caller. No blinding key goes with it in this slice:
		 * what an output hides is a decision the document makes and this runtime does not read
		 * yet, so change is returned in the open rather than hidden on a guess.
		 */
		changeScriptPubKeyHex: string;
		finalize: FinalizeTransaction;
		smplx: Pick<SmplxWasmModule, "TransactionBuilder">;
	},
): Promise<AssembleResult> {
	// A covenant being spent needs the source, the arguments and the witness the review
	// verified it under, and a signature over this transaction for the branch that asserts
	// one. None of that is established yet, and a transaction assembled without it is not a
	// smaller version of the right one — it is one the covenant refuses at execution, after
	// a person has approved it. So it refuses here, where the reason can be read.
	const spent = review.covenants.find((covenant) => covenant.role === "spent");

	if (spent) {
		return {
			ok: false,
			reason:
				`"${review.action}" spends the ${spent.utxoType} covenant, and this wallet cannot ` +
				"yet satisfy a covenant input. It will not build part of the transaction and call it whole.",
		};
	}

	if (review.selected.length === 0) {
		return { ok: false, reason: `"${review.action}" has no wallet output funding it.` };
	}

	if (review.outputs.length === 0) {
		return { ok: false, reason: `"${review.action}" pays nothing, so there is nothing to build.` };
	}

	const builder = new input.smplx.TransactionBuilder();

	try {
		for (const utxo of review.selected) {
			builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);
		}

		// Paid in the asset the review worked out for it, and to the script it derived. An
		// output built from an amount alone pays whatever asset the module defaults to, and one
		// built from an address is not hex the module can decode.
		for (const output of review.outputs) {
			builder.addOutput(output.scriptPubKeyHex, output.sats, output.asset);
		}

		// Set on the builder rather than passed to the call that signs, because where change
		// goes is a fact about this transaction and not about the signature over it.
		builder.addChange(input.changeScriptPubKeyHex);

		return { ok: true, transaction: await input.finalize(builder, review.feeRateSatsPerKvb) };
	} catch (error) {
		return { ok: false, reason: `This transaction could not be assembled: ${String(error)}` };
	} finally {
		builder.free();
	}
}
