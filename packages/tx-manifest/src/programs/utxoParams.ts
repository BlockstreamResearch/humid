import { asRecord } from "../document/json";
import { parseReference, type ReferenceScope } from "../document/references";
import { statedValue } from "../evaluation/computedValue";
import { Refusal } from "../refusal";

export type BoundParams = {
	scope: ReferenceScope;
	types: Record<string, string>;
};

export function bindUtxoParams(
	utxoType: string,
	declared: Record<string, unknown>,
	use: { args?: unknown; wiring: Record<string, unknown> },
	scope: ReferenceScope,
): BoundParams | undefined {
	const params = asRecord(declared.params);

	if (!params) {
		if (use.args !== undefined) {
			throw new Refusal(
				`An input or output gives ${utxoType} args, and the type declares no params.`,
			);
		}

		return undefined;
	}

	if (Object.keys(use.wiring).length > 0) {
		throw new Refusal(
			`An input or output gives ${utxoType} compile_params, and the type declares params, which are bound with args.`,
		);
	}

	const args = asRecord(use.args) ?? {};
	const unknown = Object.keys(args).find((name) => !Object.hasOwn(params, name));

	if (unknown !== undefined) {
		throw new Refusal(`An input or output binds ${unknown}, which is not a param of ${utxoType}.`);
	}

	const values: Record<string, string> = {};
	const types: Record<string, string> = {};

	for (const [name, entry] of Object.entries(params)) {
		const type = asRecord(entry)?.type;
		const bound = args[name];

		if (typeof type !== "string") {
			throw new Refusal(`The ${utxoType} param ${name} declares no type.`);
		}

		if (bound !== undefined && typeof bound !== "string") {
			throw new Refusal(
				`An input or output binds ${utxoType}'s ${name} to something that is not text.`,
			);
		}

		values[name] =
			bound === undefined
				? defaultOf(utxoType, name, asRecord(entry)?.default, scope)
				: statedValue(`Argument ${name}`, bound, scope);
		types[name] = type;
	}

	return { scope: { params: values }, types };
}

function defaultOf(
	utxoType: string,
	name: string,
	declared: unknown,
	scope: ReferenceScope,
): string {
	if (typeof declared !== "string") {
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
