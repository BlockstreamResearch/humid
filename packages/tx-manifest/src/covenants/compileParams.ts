import { parseReference, type ReferenceScope, resolveReference } from "../document/references";
import { type DeclaringContract, encodeContractLiteral } from "./covenantParamTypes";
import { encodeCompileParam, encodesDeclaredType, unencodableReason } from "./paramEncoding";

export type ContractArguments = Record<string, { type: string; value: string }>;

export type ResolveCompileParamsResult =
	| { arguments: ContractArguments; ok: true }
	| { ok: false; reason: string };

export function resolveCompileParams(
	wiring: Record<string, unknown>,
	declaredTypes: Record<string, string>,
	scope: ReferenceScope,
	contract?: DeclaringContract,
	declaredAtUse?: Record<string, string>,
): ResolveCompileParamsResult {
	const resolved: ContractArguments = {};

	for (const [name, reference] of Object.entries(wiring)) {
		if (typeof reference !== "string") {
			return { ok: false, reason: `Compile parameter ${name} is not a reference.` };
		}

		const found = resolveCovenantReference(reference, scope);

		if (!found.ok) {
			const literal =
				asStatedValue(name, reference, found.reason, declaredAtUse?.[name]) ??
				asContractLiteral(name, reference, found.reason, contract);

			if (!literal.ok) {
				return { ok: false, reason: `Compile parameter ${name}: ${literal.reason}` };
			}

			resolved[name] = literal.encoded;

			continue;
		}

		if (typeof found.value !== "string") {
			return {
				ok: false,
				reason: `Compile parameter ${name} resolves to ${reference}, which is not a value this runtime can encode yet.`,
			};
		}

		const declaredType = declaredAtUse?.[name] ?? declaredTypeOf(reference, declaredTypes);

		if (!encodesDeclaredType(declaredType)) {
			return { ok: false, reason: `${reference} ${unencodableReason(declaredType)}.` };
		}

		const encoded = encodeCompileParam(declaredType ?? "", found.value, name, reference);

		if (!encoded.ok) {
			return encoded;
		}

		resolved[name] = encoded.encoded;
	}

	return { arguments: resolved, ok: true };
}

function resolveCovenantReference(
	reference: string,
	scope: ReferenceScope,
): { ok: false; reason: string } | { ok: true; value: unknown } {
	const found = resolveReference(reference, "compileParam", scope);
	const parsed = parseReference(reference);

	if (found.ok || parsed?.form !== "bare") {
		return found;
	}

	return scope.instance && parsed.name in scope.instance
		? { ok: true, value: scope.instance[parsed.name] }
		: found;
}

function asStatedValue(
	name: string,
	text: string,
	referenceReason: string,
	declaredType: string | undefined,
): EncodeLiteralResult | undefined {
	if (declaredType === undefined) {
		return undefined;
	}

	if (!encodesDeclaredType(declaredType)) {
		return { ok: false, reason: `${name} is declared ${unencodableReason(declaredType)}.` };
	}

	const encoded = encodeCompileParam(declaredType, text, name, "a value");

	if (encoded.ok) {
		return encoded;
	}

	return {
		ok: false,
		reason: parseReference(text) === undefined ? encoded.reason : referenceReason,
	};
}

function asContractLiteral(
	name: string,
	text: string,
	referenceReason: string,
	contract: DeclaringContract | undefined,
): EncodeLiteralResult {
	if (!contract || contract.declares[name] === undefined) {
		return { ok: false, reason: referenceReason };
	}

	const encoded = encodeContractLiteral(name, text, contract);

	if (encoded.ok) {
		return encoded;
	}

	return {
		ok: false,
		reason: parseReference(text) === undefined ? encoded.reason : referenceReason,
	};
}

type EncodeLiteralResult =
	| { encoded: { type: string; value: string }; ok: true }
	| { ok: false; reason: string };

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
