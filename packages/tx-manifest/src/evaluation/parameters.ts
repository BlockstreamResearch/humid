import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import type { RejectToken } from "../document/refuse";
import { evaluateExpression } from "./evaluate";

export type FilledParams =
	| { ok: false; reason: string; reject: RejectToken }
	| { ok: true; params: Record<string, unknown> };

/**
 * Fills the parameters a protocol already knows the answer to.
 *
 * Three things can fill one and their order is the whole of the rule. What the request
 * supplied wins, always: a value a person chose is not a default's to overwrite. Then a value
 * the document computes from the deployment. Then the literal the document names as its
 * default, which is what "nothing supplied one" resolves to.
 *
 * The format states none of that order. It is derivable from what each of the three is for,
 * and writing it the other way round would silently replace a chosen value with a default —
 * which no test of the filled value alone would catch, because both are valid values.
 */
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

		// A value the wallet itself supplies, which this runtime cannot reach where filling
		// happens: the review runs before anyone has approved anything and deliberately opens no
		// signing key. Refused by name rather than reported as a parameter the site forgot,
		// because the document did not ask the site for it.
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
			const evaluated = evaluateExpression(computed, "issuedAmount", scope, notes);

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

		// A default is a literal the document states, never a reference: every one of the nine in
		// the corpus is a number or a byte string. Resolving it as a reference would make a
		// default that happens to look like a name mean something else entirely.
		if (typeof spec.default === "string" || typeof spec.default === "number") {
			params[name] = String(spec.default);
		}
	}

	return { ok: true, params };
}

/**
 * What of the wallet's own a parameter asks for, under either generation's spelling.
 *
 * The current generation writes `compute: {type: "wallet", wallet: "key"}`; the oldest writes
 * `source: {type: "wallet_key"}`. They are the same request and are answered together, so a
 * refusal names the thing rather than the spelling.
 */
function walletSource(spec: Record<string, unknown>): string | undefined {
	const computed = asRecord(spec.compute);

	if (computed?.type === "wallet") {
		return typeof computed.wallet === "string" ? computed.wallet.replaceAll("_", " ") : "value";
	}

	const source = asRecord(spec.source);

	return source?.type === "wallet_key" ? "key" : undefined;
}
