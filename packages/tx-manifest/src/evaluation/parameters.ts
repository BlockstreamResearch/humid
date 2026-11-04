import { asRecord } from "../document/json";
import type { NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export function fillParameters(
	action: NormalisedAction,
	supplied: Record<string, unknown>,
	scope: ReferenceScope,
): Record<string, unknown> {
	const declared = asRecord(action.node.params);

	if (!declared) {
		return supplied;
	}

	const params: Record<string, unknown> = { ...supplied };

	for (const [name, entry] of Object.entries(declared)) {
		const spec = asRecord(entry);

		if (!spec || params[name] !== undefined) {
			continue;
		}

		const fromWallet = walletSource(spec);

		if (fromWallet) {
			throw new Refusal(
				`The parameter ${name} is filled from this wallet's own ${fromWallet}, and this ` +
					"wallet cannot supply it while reviewing an action.",
				"unimplemented-construct",
			);
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

function walletSource(spec: Record<string, unknown>): string | undefined {
	const computed = asRecord(spec.compute);

	if (computed?.type !== "wallet") {
		return undefined;
	}

	return typeof computed.wallet === "string" ? computed.wallet.replaceAll("_", " ") : "value";
}
