import { inspectManifestDocument, type InspectManifestResult } from "@humid/tx-manifest";

/** Nothing has been pasted yet, which is not a fault to report. */
export type EmptyDocument = { kind: "empty" };

/** The text is not JSON at all, which the parser reports better than we could. */
export type UnreadableDocument = { kind: "unreadable"; reason: string };

export type ReadDocument =
	| EmptyDocument
	| UnreadableDocument
	| ({ kind: "read" } & InspectManifestResult);

/**
 * Turns whatever is in the textarea into one of three outcomes.
 *
 * The split between "not JSON" and "JSON but not a manifest" is deliberate: a person pasting
 * a truncated document and a person pasting the wrong file need different sentences, and
 * only the first is a syntax problem. The second is the package's own judgement and is
 * carried through unchanged rather than restated here.
 */
export function readDocument(text: string): ReadDocument {
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

	// No compiler version and no policy asset, deliberately. This page ships neither, and a
	// stand-in for either would turn "not checked" into "checked and fine" — the package
	// reports both as skipped, and the page prints that.
	return { kind: "read", ...inspectManifestDocument(parsed) };
}
