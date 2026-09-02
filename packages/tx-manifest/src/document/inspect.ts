import { isRecord } from "./json";
import { normaliseManifest, type NormalisationNote } from "./normalise";
import {
	DOCUMENT_ONLY_REJECTS,
	NEEDS_MORE_THAN_THE_DOCUMENT_REJECTS,
	type PartialCheck,
	type Refusal,
	type RejectToken,
	refuseFromDocumentAlone,
} from "./refuse";
import { type ConstructReport, describeConstructs } from "./registry";
import { contractSourcePaths } from "./sites";

/**
 * What this package makes of one document, for a reader who is not a wallet.
 *
 * Everything here is already computed on the wallet's own path and thrown away afterwards,
 * because a wallet needs a plan or a refusal and not an account of how it got there. A
 * developer holding a protocol document needs exactly that account and has no way to obtain
 * it short of connecting a wallet and trying, so this is the same work with the intermediate
 * results kept.
 */
export type ManifestInspection = {
	/** Every construct the document declares, against what this runtime does with it. */
	constructs: ConstructReport[];
	/**
	 * Every contract source path this document references, whether or not it was supplied.
	 *
	 * A caller holding files has no other way to learn which of them this document is asking
	 * for, and the answer does not depend on what it passed in — so it is reported rather than
	 * left to be inferred from what came back unread.
	 */
	contracts: string[];
	/**
	 * Checks that ran against only part of what declares them, with what went unread.
	 *
	 * Empty when every check the caller's inputs allowed was answered in full. A check here has
	 * not passed and has not been skipped: it read one of the places that decide it, which is
	 * worth saying out loud rather than folding into either neighbour.
	 */
	partial: PartialCheck[];
	/**
	 * The first refusal decided from the document alone, if any.
	 *
	 * Its absence is not a statement that a wallet would build this action. Read it with
	 * `skipped` and `unreachable`, which say what was not asked.
	 */
	refusal: Refusal | undefined;
	/** Older spellings this runtime rewrote, with where each was found. */
	rewrites: NormalisationNote[];
	/**
	 * Checks the caller's inputs did not allow, out of those a document alone can decide.
	 *
	 * Empty when the caller supplied a compiler version.
	 */
	skipped: RejectToken[];
	/** Refusals no reading of the document can reach; they need money, a chain or a request. */
	unreachable: RejectToken[];
};

/** A document that could not be read far enough to inspect. */
export type ManifestFault = {
	/** What was wrong with it, in a sentence for a person. */
	reason: string;
};

export type InspectManifestResult =
	| ({ ok: true } & ManifestInspection)
	| ({ ok: false } & ManifestFault);

export type InspectManifestOptions = {
	/**
	 * The single SimplicityHL version the reading wallet ships.
	 *
	 * Omitted, the compiler check is skipped and reported as skipped. There is no sensible
	 * stand-in: any version supplied here decides whether a document is refused, so guessing
	 * one manufactures a verdict.
	 */
	compilerVersion?: string;
	/** Contract sources by path, for the `simc` range a source may open with. */
	contractSources?: Record<string, string>;
};

/**
 * Reads one document and reports what this package makes of it, without building anything.
 *
 * Nothing here reaches a network, holds a key or remembers anything, which is what makes it
 * safe to run against a document of unknown origin — including in a browser, which is the
 * caller this exists for.
 */
export function inspectManifestDocument(
	document: unknown,
	options: InspectManifestOptions = {},
): InspectManifestResult {
	if (!isRecord(document)) {
		return {
			ok: false,
			reason: Array.isArray(document)
				? "A manifest is a JSON object, and this is a JSON array."
				: `A manifest is a JSON object, and this is ${describe(document)}.`,
		};
	}

	const { manifest, notes } = normaliseManifest(document);
	const { partial, refusal, skipped } = refuseFromDocumentAlone(manifest, options);

	return {
		constructs: describeConstructs(manifest),
		contracts: contractSourcePaths(manifest),
		ok: true,
		partial,
		refusal,
		rewrites: notes,
		skipped,
		unreachable: [...NEEDS_MORE_THAN_THE_DOCUMENT_REJECTS],
	};
}

/** Every refusal a document alone can decide, whether or not this call could ask for it. */
export const DOCUMENT_ONLY_REFUSALS: readonly RejectToken[] = DOCUMENT_ONLY_REJECTS;

function describe(value: unknown): string {
	if (value === null) {
		return "null";
	}

	return `a ${typeof value}`;
}
