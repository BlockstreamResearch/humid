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

export type ManifestInspection = {
	constructs: ConstructReport[];
	contracts: string[];
	partial: PartialCheck[];
	refusal: Refusal | undefined;
	rewrites: NormalisationNote[];
	skipped: RejectToken[];
	unreachable: RejectToken[];
};

export type ManifestFault = {
	reason: string;
};

export type InspectManifestResult =
	| ({ ok: true } & ManifestInspection)
	| ({ ok: false } & ManifestFault);

export type InspectManifestOptions = {
	compilerVersion?: string;
	contractSources?: Record<string, string>;
};

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

export const DOCUMENT_ONLY_REFUSALS: readonly RejectToken[] = DOCUMENT_ONLY_REJECTS;

function describe(value: unknown): string {
	if (value === null) {
		return "null";
	}

	return `a ${typeof value}`;
}
