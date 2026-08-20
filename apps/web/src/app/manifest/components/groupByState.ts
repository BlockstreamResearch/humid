import type { ConstructReport, ConstructSiteKind, ConstructState } from "@humid/tx-manifest";

/**
 * The order a reader wants: what stops the build first, then what merely is.
 *
 * `unrecognised` leads because it is the one state that means nobody has ever specified this
 * field here. `acted-on` trails, and used to come third, because it is the state of a field
 * that works — for the deployed lending protocol that is 360 of 620 reports, and putting them
 * before the rest buried the nine worth reading.
 */
const ORDER: ConstructState[] = [
	"unrecognised",
	"unimplemented",
	"never-read",
	"shown",
	"acted-on",
];

/**
 * The states that mean nothing is wrong, and are therefore collapsed until asked for.
 *
 * Not hidden and not dropped: a reader who wants the whole document is one click away and the
 * count is visible without clicking. What is removed is the default of meeting 611 rows that
 * each say "this field works" before reaching the nine that say anything else.
 */
const NOTHING_WRONG = new Set<ConstructState>(["shown", "acted-on"]);

/** One construct, and every position in this document that declares it. */
export type FieldRow = {
	/** Where it was found, in the document's own terms, in the order the document lists them. */
	at: string[];
	key: string;
	site: ConstructSiteKind;
};

export type ConstructGroup = {
	/** Whether this state means nothing is wrong, and so opens collapsed. */
	nothingWrong: boolean;
	rows: FieldRow[];
	state: ConstructState;
};

/**
 * Groups one document's fields by what the wallet does with them, in reading order, and
 * collapses each construct into one row carrying every position it was found at.
 *
 * The table used to draw one row per position, which is one row per key per place that key
 * appears: 620 rows for the deployed lending protocol, over 41 distinct keys and 94 places.
 * Nothing there was wrong and nothing was readable, because the repetition is inherent to the
 * shape of the data rather than to anything the document did.
 *
 * A construct is a key at a kind of position, which is how the runtime's own table is keyed:
 * `description` on an action and `description` on an output are two constructs and can be in
 * two different states. Aggregating by key alone would merge them into one row whose state is
 * whichever the loop met last.
 *
 * A function rather than a few lines inside the component because it is the only decision
 * that surface makes: everything else there is layout. There is no DOM in this repository's
 * tests, so a decision left inside JSX is a decision nothing can check.
 */
export function groupByState(constructs: ConstructReport[]): ConstructGroup[] {
	return ORDER.map((state) => ({
		nothingWrong: NOTHING_WRONG.has(state),
		rows: rowsOf(constructs.filter((report) => report.state === state)),
		state,
	})).filter((group) => group.rows.length > 0);
}

function rowsOf(reports: ConstructReport[]): FieldRow[] {
	const rows = new Map<string, FieldRow>();

	for (const report of reports) {
		const identity = `${report.site}/${report.key}`;
		const row = rows.get(identity);

		if (row) {
			row.at.push(report.at);
			continue;
		}

		rows.set(identity, { at: [report.at], key: report.key, site: report.site });
	}

	return [...rows.values()].toSorted((left, right) => left.key.localeCompare(right.key));
}
