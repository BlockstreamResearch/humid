/**
 * Whether one output hides what it carries.
 *
 * The format states the order and it is short: the output's own word, then the document's
 * file-level word, then the chain's. On Liquid the chain's word is that an output is hidden,
 * which makes silence a decision rather than an absence — and a runtime that read the first
 * two and stopped would build an open output for every document that says nothing, which is
 * every document in the published corpus.
 *
 * One destination is answered against that order rather than by it, and it is the only one:
 * a contract action's own change. See `resolveBlinding` for what that costs and why it was
 * chosen anyway.
 */

/** What an output does with the value it carries. */
export type Blinding = "hidden" | "open";

/**
 * Whose word decided an output's blinding, or which rule answered instead of a word.
 *
 * The first three are the format's precedence. `unblindable` is a destination that could
 * never hide whatever anyone says. `spendable-change` is this wallet's own rule, and it is
 * the one place the wallet answers over the format rather than under it.
 */
export type BlindingWord = "chain" | "document" | "output" | "spendable-change" | "unblindable";

/**
 * Where an output's blinding was decided, so a refusal can say whose word it was.
 *
 * The word matters more than the answer: "this protocol asked for it" and "nobody said, and
 * the network's own default is to hide" are the same outcome and different sentences, and a
 * person deciding whether to trust a site is owed the difference.
 */
export type BlindingDecision = {
	blinding: Blinding;
	decidedBy: BlindingWord;
	/**
	 * The word this wallet set aside, present only where it overrode the format.
	 *
	 * Carried rather than dropped because publishing an amount the protocol asked to hide and
	 * publishing one nobody spoke about are the same output and not the same sentence, and the
	 * person is owed that difference here for exactly the reason they are owed it above.
	 */
	overrode?: BlindingWord;
};

/** A destination that can never hide what it carries, whatever anything says. */
export type UnblindableTarget = "covenant" | "data";

/**
 * Resolves one output's blinding by the precedence the format defines.
 *
 * A covenant output and an OP_RETURN are answered before the precedence is consulted at all.
 * A Simplicity program reads exact amounts and asset ids through jets that cannot introspect a
 * commitment, so a hidden covenant output is one its own contract could never check; an
 * OP_RETURN carries bytes rather than value and has nothing to hide.
 *
 * A contract action's own change is answered after it, and against it. This is a deliberate
 * deviation from the format and the only one: the format says an output's silence about
 * confidentiality is itself a decision, and that on this network the decision is to hide. The
 * wallet keeps that rule everywhere else and breaks it here, so the change amount is published
 * on chain where the format would have kept it. That is the price and it was accepted knowingly.
 *
 * What it buys is that the money comes back spendable. A contract action can be funded only by
 * outputs that hide nothing — unblinding one needs the secrets that go with it, and the signing
 * module is handed an outpoint and its bytes and nothing more — so change returned hidden is
 * money the next action cannot reach, and a sequence of actions starves itself after the first.
 *
 * The deviation is exactly this wide: change, and nothing else. It fires only where the format
 * would have hidden, so a protocol that asks for its change in the open is simply agreed with,
 * and it never touches an output that pays anywhere but back to this person.
 */
export function resolveBlinding(input: {
	/** Set when this output is the action's own change, which the wallet returns spendable. */
	change?: boolean;
	/** The output's own declaration, when it states one. */
	declared?: unknown;
	/** The document's file-level default, when it states one. */
	documentDefault?: unknown;
	/** Set when the destination cannot hide anything whatever the document says. */
	unblindable?: UnblindableTarget;
}): BlindingDecision {
	if (input.unblindable) {
		return { blinding: "open", decidedBy: "unblindable" };
	}

	const format = byPrecedence(input);

	// Only where the format would have hidden. Where it already answers open there is nothing
	// to override and no deviation to declare — the protocol and this wallet agree.
	if (input.change && format.blinding === "hidden") {
		return { blinding: "open", decidedBy: "spendable-change", overrode: format.decidedBy };
	}

	return format;
}

/** The order the format itself defines, with nothing of this wallet's in it. */
function byPrecedence(input: { declared?: unknown; documentDefault?: unknown }): BlindingDecision {
	if (typeof input.declared === "boolean") {
		return { blinding: input.declared ? "hidden" : "open", decidedBy: "output" };
	}

	if (typeof input.documentDefault === "boolean") {
		return { blinding: input.documentDefault ? "hidden" : "open", decidedBy: "document" };
	}

	// Liquid hides by default. The format also defines a Bitcoin default of open, and this
	// runtime builds Liquid transactions and refuses every other chain before reaching here,
	// so there is no second branch to write rather than a branch left unwritten.
	return { blinding: "hidden", decidedBy: "chain" };
}
