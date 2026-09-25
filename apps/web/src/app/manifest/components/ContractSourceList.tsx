import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { SuppliedSource } from "../contractSources";

export function ContractSourceList({
	contracts,
	onClear,
	onSupply,
	supplied,
	unmatched,
}: {
	contracts: readonly string[];
	onClear: () => void;
	onSupply: (sources: SuppliedSource[]) => void;
	supplied: Record<string, string>;
	unmatched: readonly string[];
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2">
				<Label htmlFor="manifest-contracts">Contract sources</Label>
				<input
					id="manifest-contracts"
					type="file"
					multiple
					accept=".simf,text/plain"
					className="file:border-input file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1 file:text-sm"
					onChange={async (event) => {
						const chosen = [...(event.target.files ?? [])];

						onSupply(
							await Promise.all(
								chosen.map(async (file) => ({ name: file.name, text: await file.text() })),
							),
						);
					}}
				/>
			</div>

			{contracts.length === 0 ? (
				<p className="text-sm">
					This document references no contract sources, so the compiler check has only the
					document&rsquo;s own declaration to read.
				</p>
			) : (
				<ul className="flex flex-col gap-1 text-sm">
					{contracts.map((path) => (
						<li key={path} className="flex items-center gap-2">
							<Badge variant={path in supplied ? "default" : "outline"} className="font-mono">
								{path in supplied ? "read" : "not read"}
							</Badge>
							<code className="font-mono text-xs">{path}</code>
						</li>
					))}
				</ul>
			)}

			{unmatched.length > 0 && (
				<p className="text-muted-foreground text-xs">
					This document references nothing by the name {unmatched.join(", ")}, so it was not given
					to the reader. A source is checked under the path the document asks for it by, and nothing
					else.
				</p>
			)}

			{Object.keys(supplied).length > 0 && (
				<div>
					<Button variant="ghost" size="sm" onClick={onClear}>
						Forget the sources
					</Button>
				</div>
			)}
		</div>
	);
}
