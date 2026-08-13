/**
 * Whether one output hides what it carries.
 *
 * The format states the order and it is short: the output's own word, then the document's
 * file-level word, then the chain's. On Liquid the chain's word is that an output is hidden,
 * which makes silence a decision rather than an absence — and a runtime that read the first
 * two and stopped would build an open output for every document that says nothing, which is
 * every document in the published corpus.
 */

/** What an output does with the value it carries. */
export type Blinding = "hidden" | "open";

/**
 * Where an output's blinding was decided, so a refusal can say whose word it was.
 *
 * The word matters more than the answer: "this protocol asked for it" and "nobody said, and
 * the network's own default is to hide" are the same outcome and different sentences, and a
 * person deciding whether to trust a site is owed the difference.
 */
export type BlindingDecision = {
	blinding: Blinding;
	decidedBy: "chain" | "document" | "output" | "unblindable";
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
 */
export function resolveBlinding(input: {
	/** The document's file-level default, when it states one. */
	documentDefault?: unknown;
	/** The output's own declaration, when it states one. */
	declared?: unknown;
	/** Set when the destination cannot hide anything whatever the document says. */
	unblindable?: UnblindableTarget;
}): BlindingDecision {
	if (input.unblindable) {
		return { blinding: "open", decidedBy: "unblindable" };
	}

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

/** How a refusal says whose word made this output one the wallet cannot build. */
export function describeBlinding(decision: BlindingDecision): string {
	return decision.decidedBy === "output"
		? "this protocol asks for it to be hidden"
		: decision.decidedBy === "document"
			? "this protocol hides its outputs by default"
			: "nothing says otherwise and this network hides an output by default";
}
