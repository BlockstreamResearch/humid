import { Refusal } from "../refusal";
import { parseReference } from "../values/references";
import type { Scope } from "../values/scope";
import { type EncodedArgument, FormatType } from "./formatTypes";

export type ContractArguments = Record<string, EncodedArgument>;

export type DeclaringContract = { declares: Record<string, string>; source: string };

type Typing = {
	contract?: DeclaringContract;
	declaredAtUse?: Record<string, string>;
	declaredTypes: Record<string, string>;
};

export function resolveCompileParams(
	wiring: Record<string, string>,
	declaredTypes: Record<string, string>,
	scope: Scope,
	contract?: DeclaringContract,
	declaredAtUse?: Record<string, string>,
): ContractArguments {
	const typing: Typing = { contract, declaredAtUse, declaredTypes };

	return Object.fromEntries(
		Object.entries(wiring).map(([name, text]) => [
			name,
			parseReference(text) === undefined
				? literalArgument(name, text, typing)
				: referencedArgument(name, text, scope, typing),
		]),
	);
}

function referencedArgument(
	name: string,
	text: string,
	scope: Scope,
	typing: Typing,
): EncodedArgument {
	const found = Refusal.amend(
		() => scope.reference(text, "compileParam"),
		(reason) => `Compile parameter ${name}: ${reason}`,
	);

	if (typeof found !== "string") {
		throw new Refusal(
			`Compile parameter ${name} resolves to ${text}, which is not a value this runtime can encode yet.`,
		);
	}

	const reference = parseReference(text);
	const type =
		typing.declaredAtUse?.[name] ??
		(reference?.form === "input-attribute"
			? undefined
			: typing.declaredTypes[reference?.name ?? ""]);

	return Refusal.amend(
		() => FormatType.named(type).argument(found),
		(reason) => `${name} is wired to ${text}: ${reason}`,
	);
}

function literalArgument(name: string, text: string, typing: Typing): EncodedArgument {
	const declaredType = typing.declaredAtUse?.[name];

	if (declaredType !== undefined) {
		return Refusal.amend(
			() => FormatType.named(declaredType).argument(text),
			(reason) => `${name} is written as the value "${text}": ${reason}`,
		);
	}

	const { contract } = typing;
	const compilerType = contract?.declares[name];

	if (contract === undefined || compilerType === undefined) {
		throw new Refusal(
			`${name} is written as the value "${text}", and ${contract?.source ?? "the contract"} ` +
				"declares no compile parameter of that name.",
		);
	}

	return Refusal.amend(
		() => FormatType.ofCompilerType(compilerType).argument(text),
		(reason) =>
			`${name} is written as the value "${text}", and ${contract.source} declares it ` +
			`${compilerType}: ${reason}`,
	);
}
