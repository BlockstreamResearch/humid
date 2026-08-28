import type { ConstructReport, ConstructState } from "@humid/tx-manifest";

import { Badge } from "@/components/ui/badge";

import { type ConstructGroup, groupByState } from "./groupByState";

/**
 * What each state means, in the words a protocol author would use.
 *
 * The state names are the runtime's; these sentences are what a person reading the table
 * actually needs, and they say what happens rather than what the field is called.
 */
const MEANING: Record<ConstructState, { badge: BadgeVariant; sentence: string }> = {
	"acted-on": { badge: "default", sentence: "Read, and it changes what gets signed." },
	"never-read": {
		badge: "ghost",
		sentence: "Known to the format and read by nothing, here or in the reference implementation.",
	},
	shown: { badge: "secondary", sentence: "Read, and shown to a person. It decides nothing." },
	unimplemented: {
		badge: "destructive",
		sentence: "The format defines it and this wallet does not implement it.",
	},
	unrecognised: {
		badge: "destructive",
		sentence: "No specification this wallet knows describes this field here.",
	},
};

type BadgeVariant = "default" | "destructive" | "ghost" | "secondary";

/**
 * Every construct this document declares, once each, against what the runtime does with it.
 *
 * One row per construct rather than per position, because a key genuinely recurs — 94 places
 * in the deployed lending protocol — and a row per place is 620 rows saying 41 things. The
 * places are still all here, under the row that counts them.
 *
 * The two states that mean nothing is wrong open collapsed. That is the whole of what was
 * unreadable: not that the information was present, but that 611 rows of "this field works"
 * came before the nine that said anything else.
 */
export function ConstructTable({ constructs }: { constructs: ConstructReport[] }) {
	if (constructs.length === 0) {
		return <p className="text-muted-foreground text-sm">This document declares no fields.</p>;
	}

	return (
		<div className="flex flex-col gap-6">
			{groupByState(constructs).map((group) => (
				<Group key={group.state} group={group} />
			))}
		</div>
	);
}

function Group({ group }: { group: ConstructGroup }) {
	const heading = (
		<div className="flex flex-wrap items-center gap-2">
			<Badge variant={MEANING[group.state].badge}>{group.state}</Badge>
			<span className="text-muted-foreground text-xs">{MEANING[group.state].sentence}</span>
			<span className="text-muted-foreground text-xs">{countOf(group)}</span>
		</div>
	);

	if (!group.nothingWrong) {
		return (
			<section className="flex flex-col gap-2">
				{heading}
				<Rows group={group} />
			</section>
		);
	}

	return (
		<details className="flex flex-col gap-2">
			<summary className="cursor-pointer list-none">{heading}</summary>
			<div className="pt-2">
				<Rows group={group} />
			</div>
		</details>
	);
}

function Rows({ group }: { group: ConstructGroup }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<tbody>
					{group.rows.map((row) => (
						<tr key={`${row.site}/${row.key}`} className="border-border/50 border-b align-top">
							<td className="py-1 pr-4 font-mono">{row.key}</td>
							<td className="text-muted-foreground py-1">
								{whereOf(row)}
								{row.at.length > 1 && <span className="block text-xs">{row.at.join(" · ")}</span>}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * Where one construct sits, said as a place when there is one and as a count when there are
 * many. The places themselves follow underneath either way, so the count is a headline rather
 * than a substitute.
 */
function whereOf(row: { at: string[] }): string {
	if (row.at.length === 1) {
		return row.at[0] ?? "";
	}

	return `${row.at.length} positions`;
}

/**
 * How much this group holds, said before it is opened.
 *
 * A collapsed group whose size is unknown is a page hiding something; a collapsed group that
 * says how many constructs and how many positions it holds is a page that has already
 * answered the only question the reader had about it.
 */
function countOf(group: ConstructGroup): string {
	const positions = group.rows.reduce((total, row) => total + row.at.length, 0);
	const constructs = `${group.rows.length} ${group.rows.length === 1 ? "field" : "fields"}`;

	if (positions === group.rows.length) {
		return constructs;
	}

	return `${constructs}, at ${positions} positions`;
}
