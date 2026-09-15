import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
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

	// The compiler version always, because this page and the wallet now read it from the same
	// place: one constant, guarded against the submodule it describes. It used to be typed in,
	// which made the shipped inspector answerable to whatever a person happened to write —
	// including nothing, which reported the check as not run against a wallet that could have
	// answered it. The package still takes the version as an argument, because the package
	// ships no wallet and must not know one; what changed is that this caller has one.
	//
	// The contract sources only when a person has handed them over, and never a stand-in: that
	// would turn "not checked" into "checked and fine", and the package says what it could not
	// reach so the page can print it — including the half-answer, where the version is known
	// and the sources it is also declared in are not.
	return {
		kind: "read",
		...inspectManifestDocument(parsed, {
			compilerVersion: SMPLX_COMPILER_VERSION,
			...(options.contractSources === undefined
				? {}
				: { contractSources: options.contractSources }),
		}),
	};
}
