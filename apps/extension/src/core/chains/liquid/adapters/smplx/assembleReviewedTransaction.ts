import {
	guardBuiltOutputs,
	guardSpentInputs,
	type ManifestReview,
	type RejectToken,
	type StaticWitness,
} from "@humid/tx-manifest";

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
	 * Adds a covenant input: an output locked by a Simplicity program, spent by satisfying it.
	 *
	 * Everything the covenant was compiled from is passed again, because the module compiles the
	 * contract a second time to satisfy it and a compile differing in any of them produces a
	 * different script. The witness values are the compiler's own `.wit` shape as text; the
	 * signature witness is a name rather than a value, because only the signer can make one and
	 * the transaction it signs over does not exist yet.
	 */
	addCovenantInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		source: string,
		argumentsJson?: string,
		witnessJson?: string,
		signatureWitness?: string,
		extraLeavesJson?: string,
		includeDebugSymbols?: boolean,
	) => void;
	/**
	 * Adds a covenant input that also creates a new asset.
	 *
	 * The covenant half is `addCovenantInput` and the issuance half `addWalletIssuanceInput`;
	 * this exists because an input can only be added once and a document may declare both on it.
	 */
	addCovenantIssuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		source: string,
		argumentsJson: string | undefined,
		witnessJson: string | undefined,
		signatureWitness: string | undefined,
		assetAmountSats: bigint,
		inflationAmountSats: bigint,
		issuerContractHex: string | undefined,
		extraLeavesJson?: string,
		includeDebugSymbols?: boolean,
	) => AssembledIssuanceReport;
	/**
	 * The block height this transaction may not be mined before.
	 *
	 * Set rather than defaulted, and only where the review read one: a covenant branch guarded
	 * by a lock height reads this field, and a transaction declaring none satisfies no such
	 * branch.
	 */
	setLocktimeHeight: (height: number) => void;
	/**
	 * The sequence written onto every input that declares none.
	 *
	 * One value for the transaction, because that is what the module takes. The review has
	 * already collapsed what the action declares into the single value this can be, or refused
	 * the action.
	 */
	setSequence: (sequence: number) => void;
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
	| { ok: false; reason: string; reject: RejectToken }
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
	// Nothing to spend at all, which is not a transaction. Asked of the order rather than of
	// the wallet's own selection: an action whose covenant already holds everything its outputs
	// cost is funded entirely by the covenant it spends, and refusing that for holding none of
	// the wallet's own outputs would refuse the ordinary case of a protocol paying itself out.
	if (review.inputOrder.length === 0) {
		return {
			ok: false,
			reason: `"${review.action}" has nothing funding it.`,
			reject: "shortfall",
		};
	}

	if (review.outputs.length === 0) {
		return {
			ok: false,
			reason: `"${review.action}" pays nothing, so there is nothing to build.`,
			reject: "document-fault",
		};
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
			reject: "unimplemented-construct",
		};
	}

	if (review.changeBlinded && input.blindingPublicKeyHex === undefined) {
		return {
			ok: false,
			reason: `"${review.action}" returns change that must hide what it carries, and no blinding key was supplied to hide it with.`,
			reject: "unimplemented-construct",
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
				reject: "document-fault",
			};
		}

		issuing.set(key, issuance);
	}

	/**
	 * Every output this transaction will spend, covenant and wallet alike.
	 *
	 * Read off the order rather than off the selection, because the order is what actually gets
	 * added and a covenant input is in one and not the other. An asset derived from an output
	 * that is in neither is an id for something that would never come to exist.
	 */
	const spending = new Set(
		review.inputOrder.map((planned) =>
			outpointKey(planned.source === "covenant" ? planned.covenant : planned.utxo),
		),
	);
	const stranded = review.issuances.find(
		(issuance) => !spending.has(outpointKey(issuance.outpoint)),
	);

	if (stranded) {
		return {
			ok: false,
			reason:
				`Input ${stranded.inputId} issues an asset from an output this transaction does not ` +
				"spend, so the asset would never exist.",
			reject: "document-fault",
		};
	}

	// One output described twice is still one output, and adding both is a transaction that
	// spends it twice. Selection removes these, so reaching here means the review was assembled
	// by something other than a review — which is exactly when a builder should not be started.
	if (spending.size !== review.inputOrder.length) {
		return {
			ok: false,
			reason: `"${review.action}" spends one of its outputs more than once.`,
			reject: "document-fault",
		};
	}

	const builder = new input.smplx.TransactionBuilder();

	try {
		// A covenant branch guarded by a lock height reads the transaction's own locktime, and
		// one that declares none satisfies no such branch. The review answers with where the
		// chain is — the same thing every wallet writes there, and nothing about any protocol.
		// Skipped where it read nothing, because an action whose covenants are not time-locked
		// does not need one.
		if (review.locktimeHeight !== undefined) {
			builder.setLocktimeHeight(review.locktimeHeight);
		}

		// One sequence for the transaction, because that is what the module takes: it writes
		// this onto every input that declares none. The review has already collapsed what the
		// action declares into the single value this can be, or refused the action.
		if (review.sequence !== undefined) {
			builder.setSequence(review.sequence);
		}

		/** Which of the outputs an issuance was derived from have actually been added. */
		const placed = new Set<string>();

		/**
		 * The module derived the asset for itself, from the same output, and says what it made
		 * of it.
		 *
		 * This is the first fact the wallet and the module each establish independently, so it
		 * gets the treatment every other such fact gets: they are compared, and a difference
		 * refuses rather than one of the two being trusted. A silent disagreement means one of
		 * them is creating a different asset than the other, and nothing downstream could tell
		 * which — after a person has already approved the one the wallet showed them.
		 */
		const disagreement = (
			issuance: ManifestReview["issuances"][number],
			reported: AssembledIssuanceReport,
		): AssembleResult | undefined => {
			try {
				const difference = firstDisagreement(issuance, reported);

				return difference === undefined
					? undefined
					: {
							ok: false,
							reason:
								`Input ${issuance.inputId} creates an asset the signing module does not ` +
								`agree about: the ${difference.what} the wallet derived is ${difference.mine} ` +
								`and the module reports ${difference.theirs}.`,
							reject: "built-something-else",
						};
			} finally {
				reported.free();
			}
		};

		// In the order the review worked out, which is the document's wherever it states one.
		// Adding every covenant first and the wallet's own after is one order among many: a
		// covenant introspects positions, and a document stating one for an input the wallet
		// supplies is saying that that order builds a transaction its contract will not run
		// against.
		for (const planned of review.inputOrder) {
			const key =
				planned.source === "covenant" ? outpointKey(planned.covenant) : outpointKey(planned.utxo);
			const issuance = issuing.get(key);

			if (issuance) {
				placed.add(key);
			}

			if (planned.source === "covenant") {
				const { covenant } = planned;
				// The values the document states outright, which is how a covenant with more than
				// one branch is told which to run. A signature is not among them: only the signer
				// can make one, and naming it is what asks for one. Passed as the compiler's own
				// witness shape — a type and a literal, both text — because the compiler is what
				// parses SimplicityHL.
				const witness = witnessValuesJson(covenant.witnessValues);

				if (!issuance) {
					// The leaves and the mode go with the source and the parameters, because all four
					// decide the script the covenant locks to. Sending the first two alone builds a
					// different contract than the one the review checked against the chain, and the
					// covenant refuses its own spend at execution.
					builder.addCovenantInput(
						covenant.txid,
						covenant.vout,
						covenant.txOutHex,
						covenant.source,
						covenant.argumentsJson,
						witness,
						covenant.signatureWitness,
						covenant.extraLeavesJson,
						covenant.includeDebugSymbols,
					);

					continue;
				}

				// A covenant that also issues is added once, by the call that does both. The
				// issuer contract is left unstated because a manifest declares none at any
				// position, so both sides commit to nothing and each says so.
				const refusal = disagreement(
					issuance,
					builder.addCovenantIssuanceInput(
						covenant.txid,
						covenant.vout,
						covenant.txOutHex,
						covenant.source,
						covenant.argumentsJson,
						witness,
						covenant.signatureWitness,
						issuance.assetAmountSats,
						issuance.inflationAmountSats,
						undefined,
						covenant.extraLeavesJson,
						covenant.includeDebugSymbols,
					),
				);

				if (refusal) {
					return refusal;
				}

				continue;
			}

			const { utxo } = planned;

			if (!issuance) {
				builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);

				continue;
			}

			// An issuing input is added once, as an issuance. Adding it here and again as an
			// ordinary wallet input would spend the same output twice, which is not a
			// transaction at all.
			const refusal = disagreement(
				issuance,
				builder.addWalletIssuanceInput(
					utxo.txid,
					utxo.vout,
					utxo.txOut,
					issuance.assetAmountSats,
					issuance.inflationAmountSats,
					undefined,
				),
			);

			if (refusal) {
				return refusal;
			}
		}

		// Every issuance was actually added, rather than merely matched against an order that
		// contains its output. The pre-check above says the outpoint is in the order; this says
		// the loop reached it — and the two differ if the order is ever walked partially.
		const missed = review.issuances.find((issuance) => !placed.has(outpointKey(issuance.outpoint)));

		if (missed) {
			return {
				ok: false,
				reason:
					`Input ${missed.inputId} issues an asset from an output this transaction does not ` +
					"spend, so the asset would never exist.",
				reject: "document-fault",
			};
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

		const transaction = await input.finalize(builder, review.feeRateSatsPerKvb);

		// What came back is now checked against what was agreed to, out of the finished
		// transaction's own bytes. Everything above is a request made of the module — an input
		// added, an output built with a blinding key or without one — and a request is not a
		// result: whether the module honoured it is visible only here.
		//
		// A refusal returns no transaction at all rather than one with a note attached. By this
		// point the document has been read, the action resolved and the person may already have
		// approved, so there is nothing left to ask them; what failed is the agreement between
		// this wallet and the module underneath it.
		const mismatch = disagreementWith(review, transaction, input.changeScriptPubKeyHex);

		return mismatch === undefined
			? { ok: true, transaction }
			: { ok: false, reason: mismatch, reject: "built-something-else" };
	} catch (error) {
		return {
			ok: false,
			reason: `This transaction could not be assembled: ${String(error)}`,
			reject: "built-something-else",
		};
	} finally {
		builder.free();
	}
}

/**
 * The witness values one covenant input needs, in the shape the signing module takes.
 *
 * A type and a literal, both text, keyed by the name the contract declares. Nothing here parses
 * either: the compiler that will type-check the literal is the authority on what it means, and
 * a wallet reading `Right(Left(()))` for itself would be a second opinion about which branch of
 * a contract runs — given by the one component with no way to check it.
 */
function witnessValuesJson(values: StaticWitness[] | undefined): string | undefined {
	if (!values || values.length === 0) {
		return undefined;
	}

	return JSON.stringify(
		Object.fromEntries(
			values.map(({ name, simplicityType, value }) => [name, { type: simplicityType, value }]),
		),
	);
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

/**
 * Where the finished transaction and the reviewed plan disagree, if they disagree at all.
 *
 * Two questions, both answered from the raw consensus bytes and neither from the module's own
 * account of what it did — that account is the one source that cannot answer whether the module
 * did something it was not asked to, because it is the same component reporting on itself. The
 * one figure taken from the module is the fee, and it is taken in order to be checked: what it
 * says it charged is compared against what it actually wrote.
 *
 * What it spends must be exactly the set the wallet committed to: every covenant input the
 * action requires and every wallet output the wallet itself selected, each once. An input that
 * also creates an asset is one of these like any other — Elements marks issuance in the top
 * bits of the index rather than in a field of its own, and it is compared as the outpoint it
 * spends, which is what the asset was derived from in the first place.
 *
 * What it pays must be the outputs the review settled, in order, each to the script the review
 * derived and — where the output is open, and therefore where it can be read at all — for the
 * amount and in the asset the review worked out. Then the builder's own two and nothing else:
 * the change, to the script this module was told to use and hiding what the review decided, and
 * the fee.
 */
function disagreementWith(
	review: ManifestReview,
	transaction: AssembledTransaction,
	changeScriptPubKeyHex: string,
): string | undefined {
	const spent = guardSpentInputs(transaction.hex, {
		// The covenant outputs the action requires, as the review established them from the
		// chain. Read off the review rather than off what was added: what was added is this
		// module's own account of itself, which is the one source that cannot say whether the
		// module spent something nobody asked it to.
		covenantInputs: review.covenantInputs.map(({ txid, vout }) => ({ txid, vout })),
		walletInputs: review.selected.map(({ txid, vout }) => ({ txid, vout })),
	});

	if (!spent.ok) {
		return spent.reason;
	}

	const built = guardBuiltOutputs(transaction.hex, {
		changeBlinded: review.changeBlinded,
		changeScriptPubKeyHex,
		feeSats: transaction.feeSats,
		// The network's own asset, carried on the review rather than read off the transaction:
		// taking it from whatever the fee output says would make the check circular, and the one
		// thing worth knowing about a fee is that it pays the network in the money it takes.
		policyAsset: review.policyAsset,
		// Every field the review settled for each output, because every one of them is a way the
		// finished transaction can differ from the plan while still looking like it. Only the
		// asset the network charges fees in has change the builder appends; a surplus in any
		// other asset is an exact figure the review already built as one of these.
		outputs: review.outputs.map(({ asset, blinded, id, sats, scriptPubKeyHex }) => ({
			asset,
			blinded,
			id,
			sats,
			scriptPubKeyHex,
		})),
	});

	return built.ok ? undefined : built.reason;
}
