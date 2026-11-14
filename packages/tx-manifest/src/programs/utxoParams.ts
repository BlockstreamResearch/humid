import { parseReference, type ReferenceScope } from "../document/references";
import type { ProgramReference, UtxoType } from "../document/schema";
import { statedValue } from "../evaluation/computedValue";
import { Refusal } from "../refusal";

export type BoundParams = {
	scope: ReferenceScope;
	types: Record<string, string>;
};

export function bindUtxoParams(
	utxoType: string,
	declared: UtxoType,
	use: ProgramReference,
	scope: ReferenceScope,
): BoundParams | undefined {
	const { params } = declared;

	if (!params) {
		if (use.args !== undefined) {
			throw new Refusal(
				`An input or output gives ${utxoType} args, and the type declares no params.`,
			);
		}

		return undefined;
	}

	if (Object.keys(use.compile_params).length > 0) {
		throw new Refusal(
			`An input or output gives ${utxoType} compile_params, and the type declares params, which are bound with args.`,
		);
	}

	const args = use.args ?? {};
	const unknown = Object.keys(args).find((name) => !Object.hasOwn(params, name));

	if (unknown !== undefined) {
		throw new Refusal(`An input or output binds ${unknown}, which is not a param of ${utxoType}.`);
	}

	const values: Record<string, string> = {};
	const types: Record<string, string> = {};

	for (const [name, { default: fallback, type }] of Object.entries(params)) {
		const bound = args[name];

		values[name] =
			bound === undefined
				? defaultOf(utxoType, name, fallback, scope)
				: statedValue(`Argument ${name}`, bound, scope);
		types[name] = type;
	}

	return { scope: { params: values }, types };
}

function defaultOf(
	utxoType: string,
	name: string,
	declared: string | undefined,
	scope: ReferenceScope,
): string {
	if (declared === undefined) {
		throw new Refusal(
			`An input or output leaves ${utxoType}'s ${name} unbound, and the param has no default to fall back on.`,
		);
	}

	const reference = parseReference(declared);

	if (reference === undefined) {
		return declared;
	}

	if (reference.form !== "instance") {
		throw new Refusal(
			`The default of ${utxoType}'s ${name} reads "${declared}", and a default reads only instance fields.`,
		);
	}

	return statedValue(`The default of ${utxoType}'s ${name}`, declared, {
		instance: scope.instance ?? {},
		params: {},
	});
}

export function boundWiring(
	bound: BoundParams,
	contractDeclares: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.keys(bound.types)
			.filter((name) => Object.hasOwn(contractDeclares, name))
			.map((name) => [name, `params.${name}`]),
	);
}
