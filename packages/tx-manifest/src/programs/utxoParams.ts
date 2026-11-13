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
	site: { args?: unknown; wiring: Record<string, unknown> },
	scope: ReferenceScope,
): BoundParams | undefined {
	const params = asRecord(declared.params);

	if (!params) {
		if (site.args !== undefined) {
			throw new Refusal(`A site binds args to ${utxoType}, which declares no params.`);
		}

		return undefined;
	}

	if (Object.keys(site.wiring).length > 0) {
		throw new Refusal(
			`A site gives compile_params to ${utxoType}, which declares params; a site binds them with args.`,
		);
	}

	const args = asRecord(site.args) ?? {};
	const unknown = Object.keys(args).find((name) => !Object.hasOwn(params, name));

	if (unknown !== undefined) {
		throw new Refusal(`A site binds ${unknown}, which is not a param of ${utxoType}.`);
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
			throw new Refusal(`A site binds ${utxoType}'s ${name} to something that is not text.`);
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
			`A site leaves ${utxoType}'s ${name} unbound, and the param has no default to fall back on.`,
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
