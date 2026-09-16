import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import type { RejectToken } from "../document/refuse";
import { evaluateExpression } from "./evaluate";

export type FilledParams =
	| { ok: false; reason: string; reject: RejectToken }
	| { ok: true; params: Record<string, unknown> };

export function fillParameters(
	action: NormalisedAction,
	supplied: Record<string, unknown>,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): FilledParams {
	const declared = asRecord(action.node.params);

	if (!declared) {
		return { ok: true, params: supplied };
	}

	const params: Record<string, unknown> = { ...supplied };

	for (const [name, entry] of Object.entries(declared)) {
		const spec = asRecord(entry);

		if (!spec || params[name] !== undefined) {
			continue;
		}

		const fromWallet = walletSource(spec);

		if (fromWallet) {
			return {
				ok: false,
				reason:
					`The parameter ${name} is filled from this wallet's own ${fromWallet}, and this ` +
					"wallet cannot supply it while reviewing an action.",
				reject: "unimplemented-construct",
			};
		}

		const computed = spec.compute;

		if (typeof computed === "string") {
			const evaluated = evaluateExpression(computed, "expression", scope, notes);

			if (!evaluated.ok) {
				return {
					ok: false,
					reason: `The parameter ${name} is computed, and ${evaluated.reason}`,
					reject: "document-fault",
				};
			}

			params[name] = String(evaluated.value);

			continue;
		}

		if (typeof spec.default === "string" || typeof spec.default === "number") {
			params[name] = String(spec.default);
		}
	}

	return { ok: true, params };
}

function walletSource(spec: Record<string, unknown>): string | undefined {
	const computed = asRecord(spec.compute);

	if (computed?.type === "wallet") {
		return typeof computed.wallet === "string" ? computed.wallet.replaceAll("_", " ") : "value";
	}

	const source = asRecord(spec.source);

	return source?.type === "wallet_key" ? "key" : undefined;
}
