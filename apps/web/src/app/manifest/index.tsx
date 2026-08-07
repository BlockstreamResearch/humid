import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { ConstructTable } from "./components/ConstructTable";
import { RefusalPanel } from "./components/RefusalPanel";
import { RewriteList } from "./components/RewriteList";
import { readDocument } from "./readDocument";

/**
 * What this wallet makes of a txManifest document, without building anything from it.
 *
 * The three panels are the three questions a protocol author cannot answer from outside:
 * which older spellings still work, which fields this wallet acts on rather than tolerates,
 * and what it would refuse before it touches money. All three come from `@humid/tx-manifest`
 * — the same package the wallet itself reads a document with — so this page cannot describe
 * a parser that differs from the one that runs.
 *
 * It connects to nothing. There is no wallet here, no chain read and no request, which is
 * both the point and the limit: see {@link RefusalPanel} for what that costs.
 */
export default function ManifestInspector() {
	const [text, setText] = useState("");
	const document = useMemo(() => readDocument(text), [text]);

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<Card>
				<CardHeader>
					<CardTitle>Manifest inspector</CardTitle>
					<CardDescription>
						Paste a txManifest document. Nothing is sent anywhere and no wallet is needed — this
						runs the same reader the wallet uses, here in the page.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Textarea
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="{ }"
						spellCheck={false}
						className="min-h-48 font-mono text-xs"
						aria-label="Manifest document"
					/>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setText(JSON.stringify(p2pkManifest, null, 2))}
						>
							Load the p2pk example
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setText("")} disabled={text === ""}>
							Clear
						</Button>
					</div>
				</CardContent>
			</Card>

			{(() => {
				if (document.kind === "empty") {
					return null;
				}

				if (document.kind === "unreadable") {
					return (
						<Panel title="Not JSON" description="Nothing could be read from this text.">
							<p className="text-sm">{document.reason}</p>
						</Panel>
					);
				}

				if (!document.ok) {
					return (
						<Panel title="Not a manifest" description="This is JSON, and it is not a document.">
							<p className="text-sm">{document.reason}</p>
						</Panel>
					);
				}

				return (
					<>
						<Panel
							title="What the wallet would refuse"
							description="Checked before anything is built, and only against the document itself."
						>
							<RefusalPanel inspection={document} />
						</Panel>
						<Panel
							title="What each field is"
							description="Every field this document declares, against the position it sits in."
						>
							<ConstructTable constructs={document.constructs} />
						</Panel>
						<Panel
							title="What was rewritten"
							description="Spellings from earlier generations of the format, renamed on the way in."
						>
							<RewriteList rewrites={document.rewrites} />
						</Panel>
					</>
				);
			})()}
		</div>
	);
}

function Panel({
	children,
	description,
	title,
}: {
	children: React.ReactNode;
	description: string;
	title: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
