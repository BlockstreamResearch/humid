import type { ConstructSiteKind } from "@humid/tx-manifest";

export const WHERE_IT_SITS: Record<ConstructSiteKind, string> = {
	action: "on an action",
	programReference: "on a program reference",
	createInstance: "on a create_instance",
	input: "on an input",
	manifest: "on the document",
	output: "on an output",
	param: "on a parameter",
	script: "on a contract",
	simplicityHl: "on the compiler settings",
	template: "on a contract template",
	ui: "in display metadata",
	utxoType: "on a kind of holding",
	witness: "on a witness",
};
