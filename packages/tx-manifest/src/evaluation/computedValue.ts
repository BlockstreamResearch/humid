import {
	parseReference,
	type ReferenceScope,
	type ReferenceSiteKind,
	resolveReference,
} from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

const OPERATORS = new Set(["%", "(", ")", "*", "+", ",", "-", "/"]);

export function computesValue(text: string): boolean {
	return [...text].some((character) => OPERATORS.has(character));
}

export function computedValue(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
): string {
	return String(evaluateExpression(text, site, scope));
}

export function statedValue(label: string, text: string, scope: ReferenceScope): string {
	if (parseReference(text) === undefined) {
		return computesValue(text)
			? Refusal.amend(
					() => computedValue(text, "field", scope),
					(reason) => `${label}: ${reason}`,
				)
			: text;
	}

	const found = Refusal.amend(
		() => resolveReference(text, "field", scope).value,
		(reason) => `${label}: ${reason}`,
	);

	if (typeof found === "bigint" || (typeof found === "number" && Number.isSafeInteger(found))) {
		return found.toString();
	}

	if (typeof found !== "string") {
		throw new Refusal(`${label} resolves to a value this runtime cannot record yet.`);
	}

	return found;
}
