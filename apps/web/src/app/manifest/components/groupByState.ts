import type { ConstructReport, ConstructSiteKind, ConstructState } from "@humid/tx-manifest";

const ORDER: ConstructState[] = [
	"unrecognised",
	"unimplemented",
	"never-read",
	"shown",
	"acted-on",
];

const NOTHING_WRONG = new Set<ConstructState>(["shown", "acted-on"]);

export type FieldRow = {
	at: string[];
	key: string;
	site: ConstructSiteKind;
};

export type ConstructGroup = {
	nothingWrong: boolean;
	rows: FieldRow[];
	state: ConstructState;
};

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
