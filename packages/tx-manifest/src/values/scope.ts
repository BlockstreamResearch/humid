import { integerOf } from "../chain/integers";
import {
	acceptedReference,
	type ParsedReference,
	parseReference,
	type ReferencePosition,
	readsProgramArgument,
} from "../document/references";
import { Refusal } from "../refusal";
import { Expression } from "./expression";

type Values = Record<string, unknown>;

export type ScopeParts = {
	fee?: bigint;
	inputs?: Record<string, Values>;
	instance?: Values;
	params: Values;
	self?: Values;
};

export class Scope {
	readonly fee: bigint | undefined;
	readonly inputs: Record<string, Values>;
	readonly instance: Values | undefined;
	readonly params: Values;
	readonly self: Values | undefined;

	constructor(parts: ScopeParts) {
		this.fee = parts.fee;
		this.inputs = parts.inputs ?? {};
		this.instance = parts.instance;
		this.params = parts.params;
		this.self = parts.self;
	}

	withParams(values: Values): Scope {
		return this.#with({ params: { ...this.params, ...values } });
	}

	withInstance(values: Values): Scope {
		return this.#with({ instance: { ...this.instance, ...values } });
	}

	withInput(id: string, attributes: Values): Scope {
		return this.#with({ inputs: { ...this.inputs, [id]: { ...this.inputs[id], ...attributes } } });
	}

	withFee(fee: bigint): Scope {
		return this.#with({ fee });
	}

	forHook(self: Values): Scope {
		return this.#with({ self });
	}

	reference(text: string, position: ReferencePosition): unknown {
		return this.#lookUp(acceptedReference(text, position), position);
	}

	integer(value: string | number, position: ReferencePosition): bigint {
		if (typeof value === "string") {
			return Expression.evaluate(value, (reference) => this.reference(reference, position));
		}

		const integer = integerOf(value);

		if (integer === undefined) {
			throw new Refusal(`${value} is not a whole number.`);
		}

		return integer;
	}

	text(label: string, value: string, position: ReferencePosition = "field"): string {
		const found = Refusal.amend(
			() =>
				parseReference(value) !== undefined
					? this.reference(value, position)
					: Expression.computes(value)
						? this.integer(value, position)
						: value,
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

	#with(parts: Partial<ScopeParts>): Scope {
		return new Scope({
			fee: this.fee,
			inputs: this.inputs,
			instance: this.instance,
			params: this.params,
			self: this.self,
			...parts,
		});
	}

	#lookUp(reference: ParsedReference, position: ReferencePosition): unknown {
		const { name } = reference;

		switch (reference.form) {
			case "bare": {
				if (readsProgramArgument(position)) {
					return this.#lookUp({ form: "instance", name }, position);
				}

				if (name === "fee" && this.fee !== undefined) {
					return this.fee;
				}

				if (this.self && Object.hasOwn(this.self, name)) {
					return this.self[name];
				}

				throw new Refusal(
					`"${name}" names nothing here: a parameter is params.${name}, a deployment field instance.${name}.`,
				);
			}

			case "input-attribute": {
				const input = this.inputs[name];

				if (!input) {
					throw new Refusal(`"${name}" is not an input this action resolved.`);
				}

				return read(input, reference.attribute ?? "", `input ${name}`);
			}

			case "instance": {
				const fromParams = !(name in (this.instance ?? {})) && name in this.params;

				return read(fromParams ? this.params : this.instance, name, "instance");
			}

			case "params": {
				return read(this.params, name, "params");
			}
		}
	}
}

function read(source: Values | undefined, name: string, label: string): unknown {
	if (!source) {
		throw new Refusal(`This request carries no ${label} to resolve "${name}" against.`);
	}

	if (!(name in source)) {
		throw new Refusal(`${label} carries no "${name}".`);
	}

	return source[name];
}
