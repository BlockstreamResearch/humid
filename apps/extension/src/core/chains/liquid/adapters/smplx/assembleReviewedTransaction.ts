import type { ManifestReview } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

/** A transaction that has been balanced, blinded, signed and finalised, as plain facts. */
export type AssembledTransaction = {
	feeSats: bigint;
	hex: string;
	txid: string;
};

/**
 * What the module made of an issuance it was asked to add.
 *
 * A handle across the wasm boundary like everything else the module returns, so it is freed
 * on every path. The three ids are the module's own derivation from the same output the
 * wallet derived from — independently, which is why they are compared rather than trusted.
 */
export type AssembledIssuanceReport = {
	assetId: string;
	entropy: string;
	free: () => void;
	reissuanceTokenId: string;
};

/**
 * The transaction under assembly, as this module drives it.
 *
 * Stated here rather than taken whole from the module's own type, so that what is used is
 * visible and is exactly this: four calls that add inputs and outputs, and the release. Every
 * one of them is a method the SDK declares under these names and these arguments; nothing
 * that needs a key is among them, because everything that does happens on the other side of
 * `FinalizeTransaction`.
 *
 * Written structurally so it is satisfied by the real module and by a fake standing in for it
 * in a test, and so a build of the wasm that has drifted from the SDK this wallet is pinned to
 * is a mismatch here rather than a call that compiles and is not there at run time.
 */
export type AssemblingBuilder = Pick<
	InstanceType<SmplxWasmModule["TransactionBuilder"]>,
	"addChange" | "addOutput" | "addWalletInput" | "free"
> & {
	/**
	 * Adds a wallet input that also creates a new asset.
	 *
	 * The issuer contract is the last argument and is left unstated, because a manifest
	 * declares none at any position. What comes back is the module's own derivation of the
	 * asset from this very outpoint, which is the thing the reviewed plan is compared against.
	 */
	addWalletIssuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		assetAmountSats: bigint,
		inflationAmountSats: bigint,
		issuerContractHex?: string,
	) => AssembledIssuanceReport;
};

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
		 * The public key an output the document wants hidden is blinded to.
		 *
		 * A public key and nothing else. This is not a signer seam: hiding an output needs only
		 * the blinding key of the address it pays to, and this module still acquires no
		 * credential of any kind. It is supplied by the caller because it belongs to the
		 * wallet's own address, and only the caller knows which one that is.
		 *
		 * Optional because a transaction whose outputs are all open needs none. One that turns
		 * out to want a key and is given none is refused rather than built open: publishing an
		 * amount the protocol asked to keep cannot be taken back afterwards.
		 */
		blindingPublicKeyHex?: string;
		/**
		 * Where this transaction's change goes, as a script rather than an address.
		 *
		 * The wallet's own, supplied by the caller. Whether it hides what it carries is the
		 * review's answer rather than this module's: under the current design a contract
		 * action's change is deliberately published so the next action can be funded from it,
		 * and the review says so outright rather than this module assuming it.
		 */
		changeScriptPubKeyHex: string;
		finalize: FinalizeTransaction;
		/**
		 * The module's builder constructor, as this module needs it.
		 *
		 * Narrowed to a constructor of the surface stated above rather than taken from the
		 * module's own type, so a wasm build that has drifted from the SDK this wallet is
		 * pinned to fails to satisfy this instead of failing at the call.
		 */
		smplx: { TransactionBuilder: new () => AssemblingBuilder };
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

	// An output the document wants hidden needs a key to hide it with, and one that cannot be
	// supplied is refused here rather than built in the open. Publishing an amount a protocol
	// asked to keep is not a smaller version of the right transaction — it is a different one,
	// and it is on the chain permanently.
	const unblindable = review.outputs.find((output) => output.blinded);

	if (unblindable && input.blindingPublicKeyHex === undefined) {
		return {
			ok: false,
			reason:
				`The output ${unblindable.id || "(unnamed)"} must hide what it carries, and no ` +
				"blinding key was supplied to hide it with.",
		};
	}

	if (review.changeBlinded && input.blindingPublicKeyHex === undefined) {
		return {
			ok: false,
			reason: `"${review.action}" returns change that must hide what it carries, and no blinding key was supplied to hide it with.`,
		};
	}

	/**
	 * Which inputs create an asset, keyed by the output each one is derived from.
	 *
	 * That outpoint is the only join both sides promise: the manifest named the input, the
	 * wallet chose the output, and an asset id is a function of the output rather than of
	 * where the input ended up. Matching on order would be matching on something neither side
	 * states.
	 *
	 * Built and checked before the builder exists, and that is the point. Everything wrong
	 * with this join is wrong about the whole transaction rather than about one input, and a
	 * check made while adding inputs discovers it with half of them already added — leaving a
	 * builder to unwind and, on the paths that throw, an error naming the input it happened to
	 * reach rather than the disagreement that caused it. Nothing here allocates, so nothing
	 * here has to be released.
	 */
	const issuing = new Map<string, ManifestReview["issuances"][number]>();

	for (const issuance of review.issuances) {
		const key = outpointKey(issuance.outpoint);

		// Two issuances derived from one output would each be a well-formed id for a different
		// asset, and the transaction would have to spend that output twice to create both. A
		// map built without looking would simply keep the last of them and mint one asset while
		// a person had been shown two.
		if (issuing.has(key)) {
			return {
				ok: false,
				reason:
					`Input ${issuance.inputId} issues an asset from ${issuance.outpoint.txid}:` +
					`${issuance.outpoint.vout}, which another input of this transaction already ` +
					"issues from. One output cannot create two assets.",
			};
		}

		issuing.set(key, issuance);
	}

	// An asset derived from an output no input spends is an id for something that would never
	// come to exist, and the person would already have been shown it.
	const spending = new Set(review.selected.map((utxo) => outpointKey(utxo)));
	const stranded = review.issuances.find(
		(issuance) => !spending.has(outpointKey(issuance.outpoint)),
	);

	if (stranded) {
		return {
			ok: false,
			reason:
				`Input ${stranded.inputId} issues an asset from an output this transaction does not ` +
				"spend, so the asset would never exist.",
		};
	}

	// One output described twice is still one output, and adding both is a transaction that
	// spends it twice. Selection removes these, so reaching here means the review was assembled
	// by something other than a review — which is exactly when a builder should not be started.
	if (spending.size !== review.selected.length) {
		return {
			ok: false,
			reason: `"${review.action}" spends one of this wallet's outputs more than once.`,
		};
	}

	const builder = new input.smplx.TransactionBuilder();

	try {
		for (const utxo of review.selected) {
			const issuance = issuing.get(outpointKey(utxo));

			if (!issuance) {
				builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);

				continue;
			}

			// An issuing input is added once, as an issuance. Adding it here and again as an
			// ordinary wallet input would spend the same output twice, which is not a
			// transaction at all.
			//
			// The issuer contract is left unstated because a manifest declares none at any
			// position, so both sides commit to nothing and each says so.
			const reported = builder.addWalletIssuanceInput(
				utxo.txid,
				utxo.vout,
				utxo.txOut,
				issuance.assetAmountSats,
				issuance.inflationAmountSats,
				undefined,
			);

			// The module derived the asset for itself, from the same output. This is the first
			// fact the wallet and the module each establish independently, so it gets the
			// treatment every other such fact gets: they are compared, and a difference refuses
			// rather than one of the two being trusted. A silent disagreement means one of them
			// is creating a different asset than the other, and nothing downstream could tell
			// which — after a person has already approved the one the wallet showed them.
			try {
				const difference = firstDisagreement(issuance, reported);

				if (difference) {
					return {
						ok: false,
						reason:
							`Input ${issuance.inputId} creates an asset the signing module does not ` +
							`agree about: the ${difference.what} the wallet derived is ${difference.mine} ` +
							`and the module reports ${difference.theirs}.`,
					};
				}
			} finally {
				reported.free();
			}
		}

		// Paid in the asset the review worked out for it, and to the script it derived. An
		// output built from an amount alone pays whatever asset the module defaults to, and one
		// built from an address is not hex the module can decode.
		//
		// Whether it hides what it carries was decided while reading the document, not here:
		// the builder has never read it. A key is passed for the outputs the review says are
		// hidden and for no others — passing one to an open output would hide an amount the
		// protocol published on purpose.
		for (const output of review.outputs) {
			builder.addOutput(
				output.scriptPubKeyHex,
				output.sats,
				output.asset,
				output.blinded ? input.blindingPublicKeyHex : undefined,
			);
		}

		// Set on the builder rather than passed to the call that signs, because where change
		// goes is a fact about this transaction and not about the signature over it. It is
		// deliberately open under the current design — see the review's own account of why —
		// so it is given no key unless the review says otherwise.
		builder.addChange(
			input.changeScriptPubKeyHex,
			review.changeBlinded ? input.blindingPublicKeyHex : undefined,
		);

		return { ok: true, transaction: await input.finalize(builder, review.feeRateSatsPerKvb) };
	} catch (error) {
		return { ok: false, reason: `This transaction could not be assembled: ${String(error)}` };
	} finally {
		builder.free();
	}
}

/**
 * The first of the three ids the two sides disagree about, if they disagree at all.
 *
 * The first rather than all of them, because one difference is already the whole answer: the
 * two are deriving different assets, and which field showed it first is enough to say so.
 */
function firstDisagreement(
	mine: ManifestReview["issuances"][number],
	theirs: Omit<AssembledIssuanceReport, "free">,
): { mine: string; theirs: string; what: string } | undefined {
	const compared = [
		{ mine: mine.asset, theirs: theirs.assetId, what: "asset" },
		{ mine: mine.entropy, theirs: theirs.entropy, what: "entropy" },
		{ mine: mine.reissuanceToken, theirs: theirs.reissuanceTokenId, what: "reissuance token" },
	];

	return compared.find((field) => field.mine.toLowerCase() !== field.theirs.toLowerCase());
}

/**
 * The one spelling of "this output" that the joins above compare by.
 *
 * An outpoint is the only identity a transaction output has. It is not the object it was
 * described with: the two lists a review carries — the outputs the wallet selected and the
 * assets it creates — are built separately, so joining them on anything else would join them
 * on nothing.
 *
 * Lower-cased because a txid is thirty-two bytes and their casing is not part of which output
 * they name. Spelled here rather than reached for through the manifest package: this module
 * needs a key for two local maps, and a key is not a shape a package publishes.
 */
function outpointKey(outpoint: { txid: string; vout: number }): string {
	return `${outpoint.txid.trim().toLowerCase()}:${outpoint.vout}`;
}
