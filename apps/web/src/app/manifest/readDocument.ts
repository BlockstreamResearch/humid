import { inspectManifestDocument, type InspectManifestResult } from "@humid/tx-manifest";

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
	 * The single SimplicityHL version the reading wallet ships, when a person has named one.
	 *
	 * This page holds no compiler and no wallet, so there is nothing here to read it from. Left
	 * blank the check is reported as not run — supplying a stand-in would turn "not checked"
	 * into "checked and fine", which is the one thing this page must not do.
	 */
	compilerVersion?: string;
	/**
	 * The sources of the contracts this document references, under those paths.
	 *
	 * A compiler version is declared twice, and one of the two declarations lives inside the
	 * contract source. Absent them the reader answers for the document's own declaration and
	 * reports which sources it did not read, which is a third answer and not a pass.
	 */
	contractSources?: Record<string, string>;
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

	// Each value only where a person actually supplied it, and never a stand-in for one they
	// did not: the package says what it could not reach, and the page prints that — including
	// the half-answer, where a version arrived and the sources it is also declared in did not.
	return {
		kind: "read",
		...inspectManifestDocument(parsed, {
			...(options.compilerVersion === undefined || options.compilerVersion.trim() === ""
				? {}
				: { compilerVersion: options.compilerVersion.trim() }),
			...(options.contractSources === undefined
				? {}
				: { contractSources: options.contractSources }),
		}),
	};
}
