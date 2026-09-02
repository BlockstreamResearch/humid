import { type ConstructRegistryEntry, describeRegistry } from "@humid/tx-manifest";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { WHERE_IT_SITS } from "./positions";

/**
 * What this wallet reads of the transaction-manifest format, and what it does not.
 *
 * The manifest page answers a question about one document. This one answers a question no
 * document can: a construct nobody has published is invisible in every document there is, and
 * every construct the format defines and this wallet does not implement is in that position.
 * Every published protocol therefore inspects clean while they stand, which is why this is a
 * page rather than a section beside a box someone pastes into.
 *
 * It reads nothing from that page and nothing from anywhere else. Its whole content is the
 * runtime's own construct table, so it cannot describe a wallet that differs from the one that
 * runs — including the reason beside each gap, which is data the table refuses to compile
 * without rather than a sentence written here.
 */
export default function FormatSupport() {
	const entries = describeRegistry();

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<Card>
				<CardHeader>
					<CardTitle>What this wallet reads of the format</CardTitle>
					<CardDescription>
						Every field the transaction-manifest format defines, against what this wallet does with
						it. Nothing here depends on a document — it is the same table the wallet decides by,
						printed.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">{summaryOf(entries)}</p>
				</CardContent>
			</Card>

			<Section
				title="Not implemented"
				description="The format defines these and this wallet does not act on them. A document using one is refused rather than read past."
				entries={entries.filter((entry) => entry.state === "unimplemented")}
			/>
			<Section
				title="Deliberately read by nothing"
				description="Known, and read by nothing here or in the reference implementation. A document using one is not refused, because being wrong about it cannot change what gets signed."
				entries={entries.filter((entry) => entry.state === "never-read")}
			/>
			<Section
				title="Read, and shown to a person"
				description="Read and put in front of whoever approves the action. None of it decides a value."
				entries={entries.filter((entry) => entry.state === "shown")}
			/>
			<Section
				title="Read, and it changes what gets signed"
				description="The part of the format this wallet acts on."
				entries={entries.filter((entry) => entry.state === "acted-on")}
			/>
		</div>
	);
}

function Section({
	description,
	entries,
	title,
}: {
	description: string;
	entries: ConstructRegistryEntry[];
	title: string;
}) {
	if (entries.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{title}
					<Badge variant="secondary">{entries.length}</Badge>
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<tbody>
							{entries.map((entry) => (
								<tr
									key={`${entry.site ?? "everywhere"}/${entry.key}`}
									className="border-border/50 border-b align-top"
								>
									<td className="py-2 pr-4 font-mono whitespace-nowrap">{entry.key}</td>
									<td className="text-muted-foreground py-2 pr-4 whitespace-nowrap">
										{WHERE_IT_SITS[entry.site ?? "everywhere"]}
									</td>
									<td className="text-muted-foreground py-2">{entry.reason}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * How much of the format this is, said before any of it is read.
 *
 * Counted from the table rather than written down, so the sentence cannot fall behind the thing
 * it describes — which is the same reason this page exists at all.
 */
function summaryOf(entries: ConstructRegistryEntry[]): string {
	const positioned = entries.filter((entry) => entry.site !== undefined);
	const kinds = new Set(positioned.map((entry) => entry.site)).size;
	const everywhere = entries.length - positioned.length;

	return (
		`${positioned.length} fields at ${kinds} kinds of position, plus ${everywhere} that any ` +
		"JSON document may carry anywhere. Each one this wallet does not act on says why."
	);
}
