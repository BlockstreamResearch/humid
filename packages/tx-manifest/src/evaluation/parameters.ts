import { asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export type WalletValues = { address: string; key: string; script_hash: string };

export function fillParameters(
	action: Action,
	supplied: Record<string, unknown>,
	scope: ReferenceScope,
	wallet: WalletValues,
): Record<string, unknown> {
	const declared = asRecord(action.node.params);

	if (!declared) {
		return supplied;
	}

	const params: Record<string, unknown> = { ...supplied };

	for (const [name, entry] of Object.entries(declared)) {
		const spec = asRecord(entry);
		const kind = asRecord(spec?.compute)?.type;

		if (kind !== undefined && kind !== "wallet") {
			throw new Refusal(
				`The parameter ${name} is computed by ${JSON.stringify(kind)}, which this wallet does not implement yet.`,
				"unimplemented-construct",
			);
		}

		const fromWallet = kind === "wallet" ? asRecord(spec?.compute)?.wallet : undefined;

		if (fromWallet !== undefined) {
			if (typeof fromWallet !== "string" || !Object.hasOwn(wallet, fromWallet)) {
				throw new Refusal(
					`The parameter ${name} is filled from the wallet's ${JSON.stringify(fromWallet)}, ` +
						'and the format defines "key", "address" and "script_hash".',
				);
			}

			params[name] = wallet[fromWallet as keyof WalletValues];

			continue;
		}

		if (!spec || params[name] !== undefined) {
			continue;
		}

		const computed = spec.compute;

		if (typeof computed === "string") {
			params[name] = String(
				Refusal.amend(
					() => evaluateExpression(computed, "expression", scope),
					(reason) => `The parameter ${name} is computed, and ${reason}`,
				),
			);

			continue;
		}

		if (typeof spec.default === "string" || typeof spec.default === "number") {
			params[name] = String(spec.default);
		}
	}

	return params;
}
