import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { evaluateCondition } from "./evaluate";

export type ValidationFailure = { reason: string };

/**
 * Checks the rules an action declares about itself, before anything is built.
 *
 * A validation exists so a protocol can stop a transaction it considers invalid, and the
 * wallet is the only thing in a position to honour that — the site asking for the action is
 * the party the rule is written against. So a rule that fails refuses, and a rule this runtime
 * cannot read refuses too: reading half a rule permits exactly what it was written to prevent.
 *
 * Only `arithmetic` rules, which is every rule the corpus contains. A `simplicity_hl` rule is a
 * contract to execute rather than a condition to evaluate, and `utxo_exists` is a chain
 * question nothing here asks; both are refused by name.
 */
export function checkValidations(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): ValidationFailure | undefined {
	for (const declared of asArray(action.node.validations)) {
		const validation = asRecord(declared);
		const id = typeof validation?.id === "string" ? validation.id : "(unnamed)";
		const rule = asRecord(validation?.rule);

		if (rule?.type !== "arithmetic") {
			return {
				reason:
					`The rule ${id} is a ${String(rule?.type)} check, which this wallet cannot make. It ` +
					"will not build a transaction its own protocol asked it to check first.",
			};
		}

		if (typeof rule.expr !== "string") {
			return { reason: `The rule ${id} states no condition.` };
		}

		const met = evaluateCondition(rule.expr, "expression", scope, notes);

		if (!met.ok) {
			return { reason: `The rule ${id} could not be checked: ${met.reason}` };
		}

		if (!met.met) {
			return { reason: message(validation, id) };
		}
	}

	return undefined;
}

/**
 * What the person is told when a rule fails.
 *
 * The protocol's own message when it wrote one, because it knows what the rule means and this
 * wallet does not — attributed to the protocol rather than stated as the wallet's own finding,
 * which is the same rule that governs every other piece of site-authored text.
 */
function message(validation: Record<string, unknown> | undefined, id: string): string {
	const error = validation?.error;
	const declared = typeof error === "string" ? error : asRecord(error)?.message;

	return typeof declared === "string"
		? `This protocol refuses the action: ${declared}`
		: `This protocol's own rule ${id} is not satisfied by this action.`;
}
