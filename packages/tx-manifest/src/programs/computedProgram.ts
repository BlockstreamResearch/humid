import type { Compute } from "../document/schema";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import { resolveCompileParams } from "./compileParams";
import type { HashProgram } from "./programHash";
import { resolveStateLeaves } from "./stateLeaves";

export type ProgramHashing = {
	contractSources: Record<string, string>;
	declaredTypes: Record<string, string>;
	hashProgram: HashProgram;
};

type TapleafWiring = {
	declaredAtUse: Record<string, string>;
	wiring: Record<string, string>;
};

export function hashComputedProgram(
	name: string,
	compute: Compute,
	scope: Scope,
	hashing: ProgramHashing,
): string {
	return Refusal.amend(
		() => {
			const { simf } = compute;

			if (simf === undefined) {
				throw new Refusal("it names no contract to compute from.");
			}

			const source = hashing.contractSources[simf];

			if (source === undefined) {
				throw new Refusal(`the source of ${simf} was not supplied.`);
			}

			const { declaredAtUse, wiring } = tapleafWiring(compute);

			return hashing.hashProgram({
				argumentsJson: JSON.stringify(
					resolveCompileParams(wiring, hashing.declaredTypes, scope, undefined, declaredAtUse),
				),
				extraLeavesJson: JSON.stringify(
					resolveStateLeaves(compute.extra_leaves, { at: name, scope }),
				),
				source,
			});
		},
		(reason) => `Computing ${name}: ${reason}`,
	);
}

export function tapleafWiring(compute: Compute): TapleafWiring {
	const declaredAtUse: Record<string, string> = {};
	const wiring: Record<string, string> = {};

	for (const [name, spec] of Object.entries(compute.params)) {
		if (typeof spec === "string") {
			wiring[name] = spec;

			continue;
		}

		if (spec.type !== undefined) {
			declaredAtUse[name] = spec.type;
		}

		wiring[name] = spec.value;
	}

	return { declaredAtUse, wiring };
}
