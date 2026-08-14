import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { SuppliedSource } from "../contractSources";

/**
 * The contracts a document references, and which of them this page has been handed.
 *
 * A version this wallet does not ship can be asked for in two places, and one of them is
 * inside the contract source. Nothing about a document says what its contracts contain, so
 * this is the only way the second half of that check can run at all — and until it does, the
 * page says so rather than reporting the check as done.
 *
 * The files never leave the page. They are read in the browser, the same way the document in
 * the textarea is, which is what lets this ask for them at all.
 */
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
					document's own declaration to read and has read it.
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
