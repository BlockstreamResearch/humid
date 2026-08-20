import { asArray, asRecord } from "./json";
import type { NormalisationNote, NormalisedAction } from "./normalise";
import { parseReference, type ReferenceScope, resolveReference } from "./references";

/**
 * What a document has actually said about the asset a piece of value is in.
 *
 * Three different statements, and the format writes all three as a plain string. The first two
 * are the document committing to an asset. The third is it deferring the answer to a file the
 * document does not contain — this deployment's fields, or the request's own parameters.
 *
 * Telling them apart is the whole point. A runtime that reads a deferred lookup as a committed
 * asset is answering a question the document has not asked yet, and the answer it reaches is
 * about the spelling rather than about the money.
 */
export type StatedAsset =
	/** A lookup this document leaves to be resolved later. */
	| { kind: "deferred"; reference: string }
	/** An asset this document names outright, and which is not this network's own. */
	| { kind: "identified"; id: string }
	/** The asset this network charges its fees in, however the document spelled it. */
	| { kind: "network" };

/** The word every generation of the format uses for the asset its network charges fees in. */
const NETWORK_ASSET = "lbtc";

/**
 * An asset id as the format writes one: thirty-two bytes of hex and nothing else.
 *
 * Tested before the text is offered to the reference parser, and that order is load-bearing. A
 * bare reference and an asset id are both runs of `[A-Za-z0-9_]` to a parser, so an id that
 * happens to begin with a letter — this project already has `feb3d9…` on file — parses as a
 * perfectly good reference to something named `feb3d9…`. Length and alphabet separate the two.
 * Nothing else does, and asking the parser first gets the answer backwards on real ids.
 */
const ASSET_ID = /^[0-9a-f]{64}$/;

/**
 * Reads what a document has said about one asset.
 *
 * The network's own asset is accepted under either spelling the corpus uses: the keyword, and
 * the id itself. They are the same asset and a document may write either.
 *
 * Anything that is neither the network's asset nor a resolvable lookup is treated as an asset
 * the document identified, which is the safe direction — an unrecognisable spelling is refused
 * rather than deferred into a check that will never be reached.
 */
export function statedAsset(declared: string, policyAsset: string): StatedAsset {
	const text = declared.trim();
	const lowered = text.toLowerCase();

	if (lowered === NETWORK_ASSET || lowered === policyAsset.trim().toLowerCase()) {
		return { kind: "network" };
	}

	if (ASSET_ID.test(lowered)) {
		return { id: lowered, kind: "identified" };
	}

	return parseReference(text)
		? { kind: "deferred", reference: text }
		: { id: text, kind: "identified" };
}

/**
 * Every asset an action states, in the order a person reading the document would meet them.
 *
 * Inputs and outputs both, because value arriving in an asset and value leaving in one are the
 * same fact about the transaction from opposite ends.
 */
function statedAssets(action: NormalisedAction): { at: string; declared: string }[] {
	const found: { at: string; declared: string }[] = [];

	for (const kind of ["inputs", "outputs"] as const) {
		for (const entry of asArray(action.node[kind])) {
			const node = asRecord(entry);
			const declared = node?.asset;

			if (typeof declared === "string") {
				found.push({ at: typeof node?.id === "string" ? node.id : "(unnamed)", declared });
			}
		}
	}

	return found;
}

/**
 * The asset a document commits to that this wallet does not move, if it commits to one.
 *
 * This is everything the document alone can settle. A deferred lookup is not an asset yet, and
 * refusing one says the document moves an asset this wallet cannot — which is a claim about
 * money that nothing has established. The rest is decided by `refuseUnfundableAsset`, once the
 * deployment's fields have been read and the lookup resolves to something.
 */
export function identifiedForeignAsset(
	action: NormalisedAction,
	policyAsset: string,
): { asset: string; at: string } | undefined {
	for (const { at, declared } of statedAssets(action)) {
		const stated = statedAsset(declared, policyAsset);

		if (stated.kind === "identified") {
			return { asset: stated.id, at };
		}
	}

	return undefined;
}

/**
 * Why this wallet cannot fund the action, once every asset it states has resolved.
 *
 * This is the rule the document-level check was reaching for and could not implement, because
 * the answer is not in the document. It is enforced here, against resolved ids.
 *
 * The rule is arithmetic rather than taste. This runtime keeps one running total: it nets what
 * the covenants it spends already hold against what the action's outputs cost, and funds the
 * remainder from the wallet, which holds the asset the network charges fees in. Netting two
 * assets into one total is only sound when there is one asset. So a second one is refused here
 * rather than added to a sum that would no longer mean anything — and a lookup that cannot be
 * resolved is refused with it, because not knowing what is being paid in is exactly the moment
 * not to pay.
 */
export function refuseUnfundableAsset(
	action: NormalisedAction,
	policyAsset: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): string | undefined {
	for (const { at, declared } of statedAssets(action)) {
		const stated = statedAsset(declared, policyAsset);

		if (stated.kind === "network") {
			continue;
		}

		if (stated.kind === "identified") {
			return (
				`${action.name} moves ${stated.id} at ${at}, and this wallet funds an action only ` +
				"in the network's own asset."
			);
		}

		const found = resolveReference(stated.reference, "asset", scope, notes);

		if (!found.ok) {
			return (
				`${action.name} states the asset at ${at} as ${stated.reference}, and this wallet ` +
				`could not establish what that is: ${found.reason}`
			);
		}

		if (typeof found.value !== "string") {
			return (
				`${action.name} states the asset at ${at} as ${stated.reference}, which resolved to ` +
				"something that is not an asset id."
			);
		}

		const resolved = statedAsset(found.value, policyAsset);

		if (resolved.kind !== "network") {
			return (
				`${action.name} moves ${found.value} at ${at}, which ${stated.reference} resolves ` +
				"to, and this wallet funds an action only in the network's own asset."
			);
		}
	}

	return undefined;
}
