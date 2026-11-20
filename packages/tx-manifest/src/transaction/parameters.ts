import { scriptHashOf } from "../chain/scriptHash";
import type { Action } from "../document/manifest";
import type { Compute } from "../document/schema";
import { hashComputedProgram, type ProgramHashing } from "../programs/computedProgram";
import { Refusal } from "../refusal";
import { Scope } from "../values/scope";

export type WalletValues = { address: string; key: string; script_hash: string };

export type ParameterSources = ProgramHashing & {
	readAddress: (address: string) => { scriptPubKeyHex: string };
	wallet: WalletValues;
};

export function resolveParameters(
	action: Action,
	supplied: Record<string, unknown>,
	instance: Record<string, unknown>,
	sources: ParameterSources,
): Record<string, unknown> {
	const params: Record<string, unknown> = { ...supplied };
	const declared = Object.entries(action.params);

	for (const [name, { compute, default: fallback }] of declared) {
		if (typeof compute === "object" && compute.type === "wallet") {
			params[name] = walletValue(name, compute, sources.wallet);
		} else if (compute === undefined && params[name] === undefined && fallback !== undefined) {
			params[name] = String(fallback);
		}
	}

	for (const [name, { compute }] of declared) {
		const scope = new Scope({ instance, params });

		if (typeof compute === "string" && params[name] === undefined) {
			params[name] = String(
				Refusal.amend(
					() => scope.integer(compute, "expression"),
					(reason) => `The parameter ${name} is computed, and ${reason}`,
				),
			);
		} else if (typeof compute === "object" && compute.type !== "wallet") {
			params[name] = computedValue(name, compute, scope, sources);
		}
	}

	return params;
}

function computedValue(
	name: string,
	compute: Compute,
	scope: Scope,
	sources: ParameterSources,
): string {
	switch (compute.type) {
		case "tapleaf": {
			return hashComputedProgram(name, compute, scope, sources);
		}
		case "script_hash": {
			return Refusal.amend(
				() => scriptHashOf(sources.readAddress(addressOf(compute, scope)).scriptPubKeyHex),
				(reason) => `Computing ${name}: ${reason}`,
			);
		}
		default: {
			throw new Refusal(
				`The parameter ${name} is computed by ${JSON.stringify(compute.type)}, which this wallet does not implement yet.`,
				"unimplemented-construct",
			);
		}
	}
}

function addressOf(compute: Compute, scope: Scope): string {
	if (compute.address === undefined) {
		throw new Refusal("it names no address to hash.");
	}

	return scope.text("its address", compute.address, "destination");
}

function walletValue(name: string, compute: Compute, wallet: WalletValues): string {
	const from = compute.wallet;

	if (from === undefined || !Object.hasOwn(wallet, from)) {
		throw new Refusal(
			`The parameter ${name} is filled from the wallet's ${JSON.stringify(from)}, ` +
				'and the format defines "key", "address" and "script_hash".',
		);
	}

	return wallet[from as keyof WalletValues];
}
