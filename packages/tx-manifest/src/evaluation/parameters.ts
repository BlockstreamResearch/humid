import type { Action } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import type { Compute } from "../document/schema";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export type WalletValues = { address: string; key: string; script_hash: string };

export function fillParameters(
	action: Action,
	supplied: Record<string, unknown>,
	scope: ReferenceScope,
	wallet: WalletValues,
): Record<string, unknown> {
	const params: Record<string, unknown> = { ...supplied };

	for (const [name, { compute, default: fallback }] of Object.entries(action.params)) {
		if (typeof compute === "object") {
			params[name] = walletValue(name, compute, wallet);

			continue;
		}

		if (params[name] !== undefined) {
			continue;
		}

		if (compute !== undefined) {
			params[name] = String(
				Refusal.amend(
					() => evaluateExpression(compute, "expression", scope),
					(reason) => `The parameter ${name} is computed, and ${reason}`,
				),
			);

			continue;
		}

		if (fallback !== undefined) {
			params[name] = String(fallback);
		}
	}

	return params;
}

function walletValue(name: string, compute: Compute, wallet: WalletValues): string {
	if (compute.type !== "wallet") {
		throw new Refusal(
			`The parameter ${name} is computed by ${JSON.stringify(compute.type)}, which this wallet does not implement yet.`,
			"unimplemented-construct",
		);
	}

	const from = compute.wallet;

	if (from === undefined || !Object.hasOwn(wallet, from)) {
		throw new Refusal(
			`The parameter ${name} is filled from the wallet's ${JSON.stringify(from)}, ` +
				'and the format defines "key", "address" and "script_hash".',
		);
	}

	return wallet[from as keyof WalletValues];
}
