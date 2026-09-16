import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import { inspectManifestDocument, type InspectManifestResult } from "@humid/tx-manifest";

export type EmptyDocument = { kind: "empty" };

export type UnreadableDocument = { kind: "unreadable"; reason: string };

export type ReadDocument =
	| EmptyDocument
	| UnreadableDocument
	| ({ kind: "read" } & InspectManifestResult);

export type ReadOptions = {
	contractSources?: Record<string, string>;
};

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
