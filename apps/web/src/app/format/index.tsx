import { type ConstructRegistryEntry, describeRegistry } from "@humid/tx-manifest";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { WHERE_IT_SITS } from "./constructKinds";

export default function FormatSupport() {
	const entries = describeRegistry();

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<Card>
				<CardHeader>
					<CardTitle>What this wallet reads of the format</CardTitle>
					<CardDescription>
						Every field the transaction-manifest format defines, against what this wallet does with
						each. Nothing here depends on a document: this is the same table the wallet decides by,
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
									key={`${entry.kind}/${entry.key}`}
									className="border-border/50 border-b align-top"
								>
									<td className="py-2 pr-4 font-mono whitespace-nowrap">{entry.key}</td>
									<td className="text-muted-foreground py-2 whitespace-nowrap">
										{WHERE_IT_SITS[entry.kind]}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}

function summaryOf(entries: ConstructRegistryEntry[]): string {
	const kinds = new Set(entries.map((entry) => entry.kind)).size;

	return `${entries.length} fields at ${kinds} kinds of position.`;
}
