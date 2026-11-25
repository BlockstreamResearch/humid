export type Blinding = "blinded" | "open";

export type BlindingWord =
	| "beside-lone-output"
	| "chain"
	| "confidential-input"
	| "lone-output"
	| "output"
	| "spendable-change"
	| "unblindable";

export type BlindingDecision = {
	blinding: Blinding;
	decidedBy: BlindingWord;
};

export type UnblindableTarget = "program" | "data";

export function resolveBlinding(input: {
	change?: boolean;
	declared?: unknown;
	unblindable?: UnblindableTarget;
}): BlindingDecision {
	if (input.unblindable) {
		return { blinding: "open", decidedBy: "unblindable" };
	}

	if (input.change && typeof input.declared !== "boolean") {
		return { blinding: "open", decidedBy: "spendable-change" };
	}

	return byPrecedence(input);
}

export function resolveChangeBlinding(
	planned: BlindingDecision,
	spendsConfidentialInput: boolean,
): BlindingDecision {
	if (!spendsConfidentialInput || planned.blinding === "blinded") {
		return planned;
	}

	return { blinding: "blinded", decidedBy: "confidential-input" };
}

function byPrecedence(input: { declared?: unknown }): BlindingDecision {
	if (typeof input.declared === "boolean") {
		return { blinding: input.declared ? "blinded" : "open", decidedBy: "output" };
	}

	return { blinding: "blinded", decidedBy: "chain" };
}

export function describeBlinding(decidedBy: BlindingWord): string {
	return sentenceFor(decidedBy);
}

function sentenceFor(word: BlindingWord): string {
	switch (word) {
		case "confidential-input": {
			return "this action spends a blinded amount, and the network accepts that only if something it pays out is blinded too";
		}

		case "beside-lone-output": {
			return "every input amount is public, so one blinded output alone could be worked out from the other amounts; blinding the change as well keeps the outputs hidden";
		}

		case "lone-output": {
			return "every input amount is public and no other output is blinded, so this amount could be worked out from the other amounts anyway";
		}

		case "output": {
			return "this protocol asks for it to be blinded";
		}

		case "spendable-change": {
			return "the protocol does not ask for the change to be blinded, so the amount stays explicit for the next action to spend";
		}

		case "unblindable": {
			return "this output's own contract has to read the amount";
		}

		default: {
			return "nothing says otherwise and this network blinds an output by default";
		}
	}
}
