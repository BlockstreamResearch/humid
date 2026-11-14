import type { ProgramReference, UtxoType } from "../document/schema";
import { Refusal } from "../refusal";
import { parseReference } from "../values/references";
import { Scope } from "../values/scope";

export type BoundParams = {
	scope: Scope;
	types: Record<string, string>;
};

export function bindUtxoParams(
	utxoType: string,
	declared: UtxoType,
	use: ProgramReference,
	scope: Scope,
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
				: scope.text(`Argument ${name}`, bound);
		types[name] = type;
	}

	return { scope: new Scope({ params: values }), types };
}

function defaultOf(
	utxoType: string,
	name: string,
	declared: string | undefined,
	scope: Scope,
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

	return new Scope({ instance: scope.instance ?? {}, params: {} }).text(
		`The default of ${utxoType}'s ${name}`,
		declared,
	);
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
