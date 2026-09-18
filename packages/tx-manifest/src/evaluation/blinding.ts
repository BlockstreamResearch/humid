export type Blinding = "blinded" | "open";

export type BlindingWord =
	| "chain"
	| "confidential-input"
	| "document"
	| "output"
	| "spendable-change"
	| "unblindable";

export type BlindingDecision = {
	blinding: Blinding;
	decidedBy: BlindingWord;
	overrode?: BlindingWord;
};

export type UnblindableTarget = "covenant" | "data";

export function resolveBlinding(input: {
	change?: boolean;
	declared?: unknown;
	documentDefault?: unknown;
	unblindable?: UnblindableTarget;
}): BlindingDecision {
	if (input.unblindable) {
		return { blinding: "open", decidedBy: "unblindable" };
	}

	const format = byPrecedence(input);

	if (input.change && format.blinding === "blinded") {
		return { blinding: "open", decidedBy: "spendable-change", overrode: format.decidedBy };
	}

	return format;
}

/**
 * Liquid cannot balance the blinding factors of a transaction that spends a blinded input and
 * blinds no output, so change the wallet would publish is blinded instead. Only coin selection
 * knows whether such an input is spent, which is why this is decided after it.
 */
export function resolveChangeBlinding(
	planned: BlindingDecision,
	spendsConfidentialInput: boolean,
): BlindingDecision {
	if (!spendsConfidentialInput || planned.blinding === "blinded") {
		return planned;
	}

	return { blinding: "blinded", decidedBy: "confidential-input", overrode: planned.decidedBy };
}

function byPrecedence(input: { declared?: unknown; documentDefault?: unknown }): BlindingDecision {
	if (typeof input.declared === "boolean") {
		return { blinding: input.declared ? "blinded" : "open", decidedBy: "output" };
	}

	if (typeof input.documentDefault === "boolean") {
		return { blinding: input.documentDefault ? "blinded" : "open", decidedBy: "document" };
	}

	return { blinding: "blinded", decidedBy: "chain" };
}

export function describeBlinding(decision: BlindingDecision): string {
	return sentenceFor(decision.decidedBy);
}

export function describePublishedChange(overrode?: BlindingWord): string {
	return overrode === undefined
		? sentenceFor("spendable-change")
		: `${sentenceFor(overrode)}, and this wallet publishes it anyway so your next action can spend it`;
}

function sentenceFor(word: BlindingWord): string {
	switch (word) {
		case "confidential-input": {
			return "this action spends a blinded amount, and the network accepts that only if something it pays out is blinded too";
		}

		case "document": {
			return "this protocol blinds its outputs by default";
		}

		case "output": {
			return "this protocol asks for it to be blinded";
		}

		case "spendable-change": {
			return "this wallet publishes a contract's change so your next action can spend it";
		}

		case "unblindable": {
			return "this output's own contract has to read the amount";
		}

		default: {
			return "nothing says otherwise and this network blinds an output by default";
		}
	}
}
