import type { NormalisationNote } from "@humid/tx-manifest";

/**
 * The renamings themselves, against the fields they renamed.
 *
 * This used to be a region of its own, and it was the least readable thing on the page: it
 * reported, at the weight of a finding, that the reader had accepted an older spelling and
 * carried on — which changed nothing about the answer. What is worth knowing from it is one
 * sentence and lives in the verdict now. What is left is a lookup, for someone who has the
 * document open and wants to know which of its keys the runtime knows by another name.
 *
 * Nothing is rendered when nothing was renamed. The verdict has already said so, and a second
 * statement of it here would be the page repeating itself at the reader.
 */
export function RewriteList({ rewrites }: { rewrites: NormalisationNote[] }) {
	if (rewrites.length === 0) {
		return null;
	}

	return (
		<section className="flex flex-col gap-2">
			<h3 className="text-sm font-medium">Renamed on the way in</h3>
			<p className="text-muted-foreground text-sm">
				The wallet accepted these older spellings and read them under the current name. A document
				needing this is from an earlier generation of the format — it still works, and nothing about
				it says which generation it is.
			</p>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<tbody>
						{rewrites.map((note) => (
							<tr key={`${note.at}/${note.found}`} className="border-border/50 border-b">
								<td className="py-1 pr-4 font-mono line-through opacity-60">{note.found}</td>
								<td className="py-1 pr-4 font-mono">{note.canonical}</td>
								<td className="text-muted-foreground py-1">{note.at}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
