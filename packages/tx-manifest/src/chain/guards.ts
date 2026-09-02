import { type Outpoint, outpointKey } from "./outpoint";
import type { FieldForm, ParsedTxOut } from "./rawTransaction";
import { spentInputs, txOutsOf } from "./rawTransaction";

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** What the wallet committed to spending, before the signing module was given anything. */
export type ExpectedInputs = {
	/** The covenant outpoints the action requires, resolved and verified against the chain. */
	covenantInputs: Outpoint[];
	/** The wallet's own outputs, chosen on this side because coin selection happens here. */
	walletInputs: Outpoint[];
};

/**
 * Checks the finished transaction spends exactly what it was supposed to — no more, no less,
 * and no output twice.
 *
 * The wallet knows the whole expected set before the signing module runs: the covenant inputs
 * the action requires, which the runtime resolved and verified against the chain, and the
 * wallet outputs the wallet itself selected. Nothing else has any business being spent.
 *
 * **Exactly, rather than as sets.** Comparing two sets answers "was every one of these
 * mentioned" and cannot answer "how many times" — so a transaction spending one output twice
 * reads as identical to one spending it once, and a transaction spending an output nobody
 * chose can be hidden by also repeating one that was. Neither is a transaction, and a guard
 * whose whole job is to notice a module doing something it was not asked to must not be the
 * thing that cannot see it. So duplicates refuse on both sides: in what came back, because
 * that is not a transaction, and in what was expected, because a wallet that asked for one
 * output twice has already lost track of what it is spending and is in no position to check
 * anything.
 *
 * An input that also creates an asset is one of these like any other. Elements marks issuance
 * in the top bits of the index rather than in a field of its own, and the reader unmasks it —
 * so an issuing input is compared as the outpoint it spends, which is exactly what the wallet
 * committed to when it derived the asset from that outpoint.
 */
export function guardSpentInputs(transactionHex: string, expected: ExpectedInputs): GuardResult {
	const observed = spentInputs(transactionHex);

	if (!observed.ok) {
		return { ok: false, reason: observed.reason };
	}

	const required = [...expected.covenantInputs, ...expected.walletInputs];
	// Across both lists rather than within each: a covenant outpoint that is also in the
	// wallet's own selection is one output the transaction would have to spend twice.
	const repeated = firstRepeat(required);

	if (repeated !== undefined) {
		return {
			ok: false,
			reason:
				`This action requires ${repeated} more than once, which no transaction can spend. ` +
				"Nothing is returned.",
		};
	}

	const spentTwice = firstRepeat(observed.spent);

	if (spentTwice !== undefined) {
		return {
			ok: false,
			reason: `The signed transaction spends ${spentTwice} twice. Nothing is returned.`,
		};
	}

	const permitted = new Set(required.map((outpoint) => outpointKey(outpoint)));
	const seen = new Set(observed.spent.map((outpoint) => outpointKey(outpoint)));

	for (const outpoint of observed.spent) {
		if (!permitted.has(outpointKey(outpoint))) {
			return {
				ok: false,
				reason:
					`The signed transaction spends ${outpointKey(outpoint)}, which this action does not ` +
					"require and the wallet did not choose. Nothing is returned.",
			};
		}
	}

	for (const outpoint of required) {
		if (!seen.has(outpointKey(outpoint))) {
			return {
				ok: false,
				reason:
					`The signed transaction leaves out ${outpointKey(outpoint)}, which this action ` +
					"requires. Nothing is returned.",
			};
		}
	}

	return { ok: true };
}

/**
 * The first outpoint named twice, by the one spelling the whole package compares outputs by.
 *
 * Canonical rather than literal: a txid is thirty-two bytes and the case it is written in is
 * not part of which output it names, so two spellings of one outpoint are one outpoint here
 * exactly as they are everywhere else.
 */
function firstRepeat(outpoints: Outpoint[]): string | undefined {
	const seen = new Set<string>();

	for (const outpoint of outpoints) {
		const key = outpointKey(outpoint);

		if (seen.has(key)) {
			return key;
		}

		seen.add(key);
	}

	return undefined;
}

/** One output the wallet built, as everything about it that is visible in the finished bytes. */
export type ExpectedOutput = {
	/** The asset it pays in, as the chain writes the id. Unobservable once the output is hidden. */
	asset: string;
	/** Whether the wallet decided this output hides what it carries. */
	blinded: boolean;
	/** The manifest's id for it, so a refusal can name the one that came back wrong. */
	id: string;
	/** What it pays, in base units. Unobservable once the output is hidden. */
	sats: bigint;
	/**
	 * The script it pays to, as hex rather than as an address.
	 *
	 * Hex on both sides, and the comparison is a comparison of bytes. Nothing here decodes an
	 * address: this package holds no bech32 reader, so a caller that hands over an address is
	 * comparing an address against a script and will be told they disagree.
	 */
	scriptPubKeyHex: string;
};

/**
 * The whole of what the finished transaction may carry: the action's outputs, then the
 * module's own.
 *
 * The second half is as much of the agreement as the first. Everything after the action's own
 * outputs belongs to the builder and has exactly one permitted shape — the change this wallet
 * named a script for, if there is any, and then the fee — so a guard that let the tail be
 * anything would let a module append an output of its own, give it whatever blinding the tail
 * happened to expect, and pass.
 */
export type ExpectedOutputs = {
	/** Whether the change this transaction returns was to hide what it carries. */
	changeBlinded: boolean;
	/** The script the wallet told the builder to return change to, and the only one it may use. */
	changeScriptPubKeyHex: string;
	/** What the module says this transaction pays the network, checked against what it wrote. */
	feeSats: bigint;
	/** The action's own outputs, in the order the wallet added them. */
	outputs: ExpectedOutput[];
	/**
	 * The asset the network charges its fees in, which is the only asset a fee can be paid in.
	 *
	 * Stated rather than inferred from the transaction. Reading it off whatever the fee output
	 * happens to carry would make the check circular — the fee would be in the right asset by
	 * definition — and the one thing worth knowing about a fee output is that it pays the
	 * network in the money the network takes.
	 */
	policyAsset: string;
};

/**
 * Checks the finished transaction is the one the wallet planned, output for output.
 *
 * Whether an output hides its amount is settled while the document is read, and carried from
 * there to a signing module that has never read the document. The module is told with a
 * blinding key or the absence of one, and what it does with that is not visible from the call:
 * the answer is in the bytes that come back, where a hidden amount is a commitment and an open
 * one is a number.
 *
 * The two blinding failures are opposite and both silent. An output meant to be hidden that
 * comes back open publishes an amount the protocol meant kept, and nothing later in the
 * transaction's life can put it back. An output meant to be open that comes back hidden is
 * worse in a different way: a Simplicity program reads exact amounts through jets that cannot
 * introspect a commitment, so a covenant output built hidden is one its own contract can never
 * spend, and the money is not lost until someone tries.
 *
 * **What is compared is the whole output, not only its blinding.** An open output states its
 * script, its amount and its asset in the clear, and all three are read back and checked
 * against what the wallet decided — a module that paid the right amount of the wrong asset, or
 * the right asset to the wrong script, has built a different transaction, and every one of
 * those is visible here. A hidden output states only its script, so the script is what is
 * checked, along with the fact that its amount really is hidden.
 *
 * **And what follows them is checked as tightly as they are.** The tail belongs to the builder
 * and may be one thing: at most one change output, paying the script this wallet named and
 * hiding or publishing what the review decided, and then exactly one fee, whose amount is
 * compared against the figure the module reported for it. A tail that could hold anything
 * scripted is not a check at all — a finalizer could append an output of its own carrying the
 * blinding the guard happened to expect of change, and pass.
 */
export function guardBuiltOutputs(transactionHex: string, expected: ExpectedOutputs): GuardResult {
	const observed = txOutsOf(transactionHex);

	if (!observed.ok) {
		return { ok: false, reason: observed.reason };
	}

	for (const [at, declared] of expected.outputs.entries()) {
		const built = observed.txOuts[at];

		if (!built) {
			return {
				ok: false,
				reason:
					`The signed transaction carries ${observed.txOuts.length} outputs and this action ` +
					`built ${expected.outputs.length}. Nothing is returned.`,
			};
		}

		const wrong = disagreementOn(declared, built);

		if (wrong !== undefined) {
			return { ok: false, reason: wrong };
		}
	}

	return guardTail(observed.txOuts.slice(expected.outputs.length), expected);
}

/**
 * The shape a whole output has, or nothing where it has neither.
 *
 * An output is blinded or open as a whole. Blinded is a committed asset, a committed value and
 * a nonce for the recipient to unblind with; open is an explicit asset, an explicit value and
 * no nonce at all. Anything else is a mixture: a committed value beside a published asset says
 * how much of what is being sent while claiming to hide it, and a committed value with no
 * nonce is an amount nobody — including the recipient — can ever recover.
 *
 * Neither of those is a smaller version of a real output, and neither is distinguishable from
 * one if the only question asked is whether an amount came back as a number.
 */
function shapeOf(built: ParsedTxOut): "blinded" | "open" | undefined {
	if (forms(built, "commitment", "commitment", "commitment")) {
		return "blinded";
	}

	return forms(built, "explicit", "explicit", "null") ? "open" : undefined;
}

function forms(built: ParsedTxOut, asset: FieldForm, value: FieldForm, nonce: FieldForm): boolean {
	return built.assetForm === asset && built.valueForm === value && built.nonceForm === nonce;
}

/** Where one of the action's own outputs and the bytes that came back disagree. */
function disagreementOn(declared: ExpectedOutput, built: ParsedTxOut): string | undefined {
	if (!sameHex(built.scriptPubKeyHex, declared.scriptPubKeyHex)) {
		return (
			`The signed transaction pays ${named(declared.id)} to a script this action did not build ` +
			"it for. Nothing is returned."
		);
	}

	const shape = shapeOf(built);

	if (shape === undefined) {
		return (
			`The signed transaction writes ${named(declared.id)} as neither a hidden output nor an ` +
			"open one. Nothing is returned."
		);
	}

	const hidden = shape === "blinded";

	if (hidden !== declared.blinded) {
		return disagreement(named(declared.id), declared.blinded);
	}

	// A hidden output states its script and nothing else, so the script and the shape are the
	// whole of what there is to compare. Asserting anything further would be asserting against
	// a commitment.
	if (hidden) {
		return undefined;
	}

	if (built.amountSats !== String(declared.sats)) {
		return (
			`The signed transaction pays ${built.amountSats} to ${named(declared.id)}, and this ` +
			`action pays ${declared.sats} there. Nothing is returned.`
		);
	}

	return sameHex(built.rawAssetId ?? "", declared.asset)
		? undefined
		: `The signed transaction pays ${named(declared.id)} in an asset this action did not plan for it. Nothing is returned.`;
}

/**
 * The outputs the builder adds for itself, which are the only ones that may follow the
 * action's own.
 *
 * Exactly one fee, last, and explicit — the network reads its amount in order to charge it, so
 * a hidden one is not a transaction anything can accept, and it is checked against the figure
 * the module reported rather than merely for existing. Before it, at most one change output,
 * paying the script the wallet named and nothing else.
 */
function guardTail(tail: ParsedTxOut[], expected: ExpectedOutputs): GuardResult {
	if (tail.length === 0) {
		return {
			ok: false,
			reason:
				"The signed transaction pays no fee, which no network will accept. Nothing is returned.",
		};
	}

	if (tail.length > 2) {
		return {
			ok: false,
			reason:
				`The signed transaction carries ${tail.length} outputs after this action's own, and ` +
				"the builder adds only change and a fee. Nothing is returned.",
		};
	}

	const fee = tail.at(-1);

	if (!fee || fee.scriptPubKeyHex !== "") {
		return {
			ok: false,
			reason:
				"The signed transaction does not end in a fee, which is the one output the network " +
				"reads in order to charge it. Nothing is returned.",
		};
	}

	// The network reads the fee's amount and its asset in order to charge it, so a fee is open
	// in every part: an explicit asset, an explicit value and no nonce. A committed one is not
	// a private fee, it is a transaction nothing can accept.
	if (shapeOf(fee) !== "open") {
		return {
			ok: false,
			reason:
				"The signed transaction hides part of the fee it pays, which no network can read. " +
				"Nothing is returned.",
		};
	}

	if (!sameHex(fee.rawAssetId ?? "", expected.policyAsset)) {
		return {
			ok: false,
			reason:
				"The signed transaction pays its fee in something other than the asset this network " +
				"charges fees in. Nothing is returned.",
		};
	}

	if (fee.amountSats !== String(expected.feeSats)) {
		return {
			ok: false,
			reason:
				`The signed transaction pays a fee of ${fee.amountSats} and the signing module reports ` +
				`${expected.feeSats}. Nothing is returned.`,
		};
	}

	const change = tail.length === 2 ? tail[0] : undefined;

	if (!change) {
		return { ok: true };
	}

	// A second fee arrives here as an output with no script. It would be caught by the script
	// comparison below, but naming it is worth more to whoever reads the refusal than a
	// sentence about a script that did not match.
	if (change.scriptPubKeyHex === "") {
		return { ok: false, reason: "The signed transaction pays two fees. Nothing is returned." };
	}

	if (!sameHex(change.scriptPubKeyHex, expected.changeScriptPubKeyHex)) {
		return {
			ok: false,
			reason:
				"The signed transaction returns change somewhere other than the script this wallet " +
				"named. Nothing is returned.",
		};
	}

	const shape = shapeOf(change);

	if (shape === undefined) {
		return {
			ok: false,
			reason:
				"The signed transaction writes its change as neither a hidden output nor an open one. " +
				"Nothing is returned.",
		};
	}

	if ((shape === "blinded") !== expected.changeBlinded) {
		return { ok: false, reason: disagreement("the change", expected.changeBlinded) };
	}

	// Only the asset the network charges its fees in has change the builder appends — every
	// other asset's surplus is an exact figure this wallet builds as an output of its own, and
	// is one of the action's outputs above. So open change paying anything else is change in an
	// asset the builder had no business creating.
	if (shape === "open" && !sameHex(change.rawAssetId ?? "", expected.policyAsset)) {
		return {
			ok: false,
			reason:
				"The signed transaction returns change in an asset other than the one this network " +
				"charges fees in, and the builder appends change only in that one. Nothing is returned.",
		};
	}

	return { ok: true };
}

/** What a person is told when one output came back the opposite way round. */
function disagreement(what: string, wasToBeHidden: boolean): string {
	return wasToBeHidden
		? `The signed transaction publishes the amount on ${what}, which this action hides. ` +
				"Nothing is returned."
		: `The signed transaction hides the amount on ${what}, which this action leaves in the ` +
				"open. Nothing is returned.";
}

function named(id: string): string {
	return id || "(unnamed)";
}

/** Two spellings of one run of bytes are one run of bytes; their casing is not part of it. */
function sameHex(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}
