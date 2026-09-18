import type { ConstructSiteKind } from "@humid/tx-manifest";

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
