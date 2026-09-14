import { parseReference } from "./references";

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
