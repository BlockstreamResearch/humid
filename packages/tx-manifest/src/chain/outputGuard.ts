import { txOutsOf } from "./txOut";

export type OutputGuardResult = { ok: true } | { ok: false; reason: string };

/** One output the wallet built, and what it decided that output does with its amount. */
export type ExpectedBlinding = {
	/** Whether the wallet decided this output hides what it carries. */
	blinded: boolean;
	/** The manifest's id for it, so a refusal can name the one that came back wrong. */
	id: string;
};

export type ExpectedOutputs = {
	/** Whether the change this transaction returns was to hide what it carries. */
	changeBlinded: boolean;
	/** The action's own outputs, in the order the wallet added them. */
	outputs: ExpectedBlinding[];
};

/**
 * Checks the finished transaction hides exactly what the wallet decided to hide.
 *
 * Whether an output hides its amount is settled while the document is read, and carried from
 * there to a signing module that has never read the document. The module is told with a
 * blinding key or the absence of one, and what it does with that is not visible from the call:
 * the answer is in the bytes that come back, where a hidden amount is a commitment and an open
 * one is a number.
 *
 * Nothing checked that until now, and the two failures are opposite and both silent. An output
 * meant to be hidden that comes back open publishes an amount the protocol meant kept, and
 * nothing later in the transaction's life can put it back. An output meant to be open that
 * comes back hidden is worse in a different way: a Simplicity program reads exact amounts
 * through jets that cannot introspect a commitment, so a covenant output built hidden is one
 * its own contract can never spend, and the money is not lost until someone tries.
 *
 * So this is the sibling of the input guard and is written the same way — an expected set
 * against the transaction's own bytes, refusing on difference — rather than trusting that a
 * blinding key handed over was a blinding key applied.
 */
export function guardBlindedOutputs(
	transactionHex: string,
	expected: ExpectedOutputs,
): OutputGuardResult {
	const observed = txOutsOf(transactionHex);

	if (!observed.ok) {
		return { ok: false, reason: observed.reason };
	}

	if (observed.txOuts.length < expected.outputs.length) {
		return {
			ok: false,
			reason:
				`The signed transaction carries ${observed.txOuts.length} outputs and this action ` +
				`built ${expected.outputs.length}. Nothing is returned.`,
		};
	}

	for (const [at, declared] of expected.outputs.entries()) {
		// Present only when the amount is a number rather than a commitment, which is the
		// question being asked. Read from the transaction rather than from anything that
		// claims to describe it.
		const hidden = observed.txOuts[at]?.amountSats === undefined;

		if (hidden !== declared.blinded) {
			return { ok: false, reason: disagreement(declared.id, declared.blinded) };
		}
	}

	for (const txOut of observed.txOuts.slice(expected.outputs.length)) {
		// The fee is the one output a person never sees a script for: the network reads its
		// amount to charge it, so it is always in the open and it is the only output allowed
		// to be. Everything else after the action's own outputs is change.
		if (txOut.scriptPubKeyHex === "") {
			if (txOut.amountSats === undefined) {
				return {
					ok: false,
					reason:
						"The signed transaction hides the fee it pays, which no network can read. " +
						"Nothing is returned.",
				};
			}

			continue;
		}

		if ((txOut.amountSats === undefined) !== expected.changeBlinded) {
			return { ok: false, reason: disagreement("the change", expected.changeBlinded) };
		}
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
