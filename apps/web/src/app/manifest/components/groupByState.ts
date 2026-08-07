import type { ConstructReport, ConstructState } from "@humid/tx-manifest";

/**
 * The order a reader wants: what stops the build first, then what merely is.
 *
 * `unrecognised` leads because it is the one state that means nobody has ever specified this
 * field here, and `never-read` trails because knowing a field is deliberately ignored is the
 * least urgent thing this table says.
 */
const ORDER: ConstructState[] = [
	"unrecognised",
	"unimplemented",
	"acted-on",
	"shown",
	"never-read",
];

export type ConstructGroup = {
	entries: ConstructReport[];
	state: ConstructState;
};

/**
 * Groups one document's fields by what the wallet does with them, in reading order.
 *
 * A function rather than a few lines inside the component because it is the only decision
 * that surface makes: everything else there is layout. There is no DOM in this repository's
 * tests, so a decision left inside JSX is a decision nothing can check.
 */
export function groupByState(constructs: ConstructReport[]): ConstructGroup[] {
	return ORDER.map((state) => ({
		entries: constructs.filter((report) => report.state === state),
		state,
	})).filter((group) => group.entries.length > 0);
}
