import type { ConstructReport, ConstructState } from "@humid/tx-manifest";

import { Badge } from "@/components/ui/badge";

import { groupByState } from "./groupByState";

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

export function ConstructTable({ constructs }: { constructs: ConstructReport[] }) {
	if (constructs.length === 0) {
		return <p className="text-muted-foreground text-sm">This document declares no fields.</p>;
	}

	const grouped = groupByState(constructs);

	return (
		<div className="flex flex-col gap-6">
			{grouped.map((group) => (
				<section key={group.state} className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Badge variant={MEANING[group.state].badge}>{group.state}</Badge>
						<span className="text-muted-foreground text-xs">{MEANING[group.state].sentence}</span>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<tbody>
								{group.entries.map((report) => (
									<tr key={`${report.at}/${report.key}`} className="border-border/50 border-b">
										<td className="py-1 pr-4 font-mono">{report.key}</td>
										<td className="text-muted-foreground py-1">{report.at}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			))}
		</div>
	);
}
