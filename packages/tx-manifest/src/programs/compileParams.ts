import { parseReference } from "../document/references";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import {
	encodeCompileParam,
	type EncodedParam,
	encodesDeclaredType,
	unencodableReason,
} from "./paramEncoding";
import { type DeclaringContract, encodeContractLiteral } from "./programParamTypes";

export type ContractArguments = Record<string, EncodedParam>;

export function resolveCompileParams(
	wiring: Record<string, unknown>,
	declaredTypes: Record<string, string>,
	scope: Scope,
	contract?: DeclaringContract,
	declaredAtUse?: Record<string, string>,
): ContractArguments {
	const resolved: ContractArguments = {};

	for (const [name, reference] of Object.entries(wiring)) {
		if (typeof reference !== "string") {
			throw new Refusal(`Compile parameter ${name} is not a reference.`);
		}

		let found: unknown;

		try {
			found = scope.reference(reference, "compileParam");
		} catch (error) {
			if (!(error instanceof Refusal)) {
				throw error;
			}

			resolved[name] = Refusal.amend(
				() =>
					asStatedValue(name, reference, error.reason, declaredAtUse?.[name]) ??
					asContractLiteral(name, reference, error.reason, contract),
				(reason) => `Compile parameter ${name}: ${reason}`,
			);

			continue;
		}

		if (typeof found !== "string") {
			throw new Refusal(
				`Compile parameter ${name} resolves to ${reference}, which is not a value this runtime can encode yet.`,
			);
		}

		const declaredType = declaredAtUse?.[name] ?? declaredTypeOf(reference, declaredTypes);

		if (!encodesDeclaredType(declaredType)) {
			throw new Refusal(`${reference} ${unencodableReason(declaredType)}.`);
		}

		resolved[name] = encodeCompileParam(declaredType ?? "", found, name, reference);
	}

	return resolved;
}

function asStatedValue(
	name: string,
	text: string,
	referenceReason: string,
	declaredType: string | undefined,
): EncodedParam | undefined {
	if (declaredType === undefined) {
		return undefined;
	}

	if (!encodesDeclaredType(declaredType)) {
		throw new Refusal(`${name} is declared ${unencodableReason(declaredType)}.`);
	}

	return asLiteral(text, referenceReason, () =>
		encodeCompileParam(declaredType, text, name, "a value"),
	);
}

function asContractLiteral(
	name: string,
	text: string,
	referenceReason: string,
	contract: DeclaringContract | undefined,
): EncodedParam {
	if (!contract || contract.declares[name] === undefined) {
		throw new Refusal(referenceReason);
	}

	return asLiteral(text, referenceReason, () => encodeContractLiteral(name, text, contract));
}

function asLiteral(
	text: string,
	referenceReason: string,
	encode: () => EncodedParam,
): EncodedParam {
	try {
		return encode();
	} catch (error) {
		if (error instanceof Refusal && parseReference(text) !== undefined) {
			throw new Refusal(referenceReason);
		}

		throw error;
	}
}

function declaredTypeOf(
	reference: string,
	declaredTypes: Record<string, string>,
): string | undefined {
	const parsed = parseReference(reference);

	if (!parsed || parsed.form === "input-attribute") {
		return undefined;
	}

	return declaredTypes[parsed.name];
}
