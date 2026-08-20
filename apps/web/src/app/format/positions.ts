import type { ConstructSiteKind } from "@humid/tx-manifest";

/**
 * Where a field sits, in the words a person would use for it.
 *
 * A translation and not a claim: the runtime keys its table by these names and this says the
 * same thing in English, so nothing here can be true while the runtime says otherwise. It is
 * typed against the runtime's own set, so a kind of position added there and forgotten here
 * fails to compile rather than rendering a key nobody can read.
 *
 * `everywhere` is not one of the runtime's kinds. It stands for the two keys any JSON document
 * may carry at any depth, which the runtime answers once rather than listing at every position.
 */
export const WHERE_IT_SITS: Record<ConstructSiteKind | "everywhere", string> = {
	action: "on an action",
	everywhere: "anywhere",
	input: "on an input",
	manifest: "on the document",
	output: "on an output",
	param: "on a parameter",
	script: "on a contract",
	ui: "in display metadata",
	utxoType: "on a kind of holding",
	validation: "on a rule",
	witness: "on a witness",
};
