import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { evaluateCondition } from "./evaluate";

export type ValidationFailure = { reason: string };

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

function message(validation: Record<string, unknown> | undefined, id: string): string {
	const error = validation?.error;
	const declared = typeof error === "string" ? error : asRecord(error)?.message;

	return typeof declared === "string"
		? `This protocol refuses the action: ${declared}`
		: `This protocol's own rule ${id} is not satisfied by this action.`;
}
