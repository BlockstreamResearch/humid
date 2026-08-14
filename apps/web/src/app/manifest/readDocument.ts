import { inspectManifestDocument, type InspectManifestResult } from "@humid/tx-manifest";

import type { LiquidNetwork } from "@/lib/liquid-networks";

/** Nothing has been pasted yet, which is not a fault to report. */
export type EmptyDocument = { kind: "empty" };

/** The text is not JSON at all, which the parser reports better than we could. */
export type UnreadableDocument = { kind: "unreadable"; reason: string };

export type ReadDocument =
	| EmptyDocument
	| UnreadableDocument
	| ({ kind: "read" } & InspectManifestResult);

export type ReadOptions = {
	/**
	 * The network the reader should mean, when a person has said which.
	 *
	 * Two of the checks compare against the network's own asset, and the two Liquid networks
	 * carry different ones. Nothing in a document decides this, so absent an answer the reader
	 * is given no asset and reports those checks as not run.
	 */
	network?: LiquidNetwork;
};

/**
 * Turns whatever is in the textarea into one of three outcomes.
 *
 * The split between "not JSON" and "JSON but not a manifest" is deliberate: a person pasting
 * a truncated document and a person pasting the wrong file need different sentences, and
 * only the first is a syntax problem. The second is the package's own judgement and is
 * carried through unchanged rather than restated here.
 */
export function readDocument(text: string, options: ReadOptions = {}): ReadDocument {
	const trimmed = text.trim();

	if (trimmed === "") {
		return { kind: "empty" };
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(trimmed);
	} catch (error) {
		return {
			kind: "unreadable",
			reason: error instanceof Error ? error.message : "This is not JSON.",
		};
	}

	// The asset only when a person has named a network, and no compiler version at all yet.
	// Never a stand-in for either: that would turn "not checked" into "checked and fine", and
	// the package reports an absent input as skipped so the page can print it.
	return {
		kind: "read",
		...inspectManifestDocument(parsed, { policyAsset: options.network?.policyAsset }),
	};
}
