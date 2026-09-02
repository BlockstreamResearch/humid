import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { ConstructTable } from "./components/ConstructTable";
import { ContractSourceList } from "./components/ContractSourceList";
import { RewriteList } from "./components/RewriteList";
import { Verdict } from "./components/Verdict";
import { matchContractSources, type SuppliedSource } from "./contractSources";
import { readDocument } from "./readDocument";

/**
 * What this wallet would do with a txManifest document, without building anything from it.
 *
 * The page answers one question and answers it first: would this wallet refuse, and why.
 * Everything else is under it — an account of everything the reader computed, one region per
 * field of its return value, is a dump of a data structure rather than an answer, and leaves
 * the person holding the document to work out which part of it bore on anything.
 *
 * What the reader was never able to check sits inside the verdict rather than below it, because
 * the absence of a refusal is only honest beside the list of what was never asked; see
 * {@link Verdict}.
 *
 * Everything shown comes from `@humid/tx-manifest` — the same package the wallet itself reads a
 * document with — so this page cannot describe a parser that differs from the one that runs.
 *
 * It connects to nothing. There is no wallet here, no chain read and no request, which is both
 * the point and the limit.
 *
 * The compiler version and the contract sources are asked for in the input card rather than
 * reported as results, because that is what they are: this page holds no wallet, so it holds
 * neither the version one ships nor the sources a document references. Unanswered is a real
 * state and the one this opens in — a check needing one of them is reported as not run, which
 * is not the same as passing.
 */
export default function ManifestInspector() {
	const [text, setText] = useState("");
	const [compilerVersion, setCompilerVersion] = useState("");
	const [suppliedSources, setSuppliedSources] = useState<SuppliedSource[]>([]);

	// Read twice, because a file arrives under the name it has on a disk and the reader wants it
	// under the path the document references it by — and only the document says what those paths
	// are. The first read asks that question, which no supplied source can change the answer to,
	// and the second is the one the page reports.
	const { document, matched } = useMemo(() => {
		const referenced = readDocument(text, { compilerVersion });
		const byReferencedPath = matchContractSources(
			referenced.kind === "read" && referenced.ok ? referenced.contracts : [],
			suppliedSources,
		);

		return {
			document: readDocument(text, {
				compilerVersion,
				contractSources: byReferencedPath.sources,
			}),
			matched: byReferencedPath,
		};
	}, [text, compilerVersion, suppliedSources]);

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
					<div className="flex flex-col gap-2">
						<Label htmlFor="manifest-compiler">SimplicityHL version</Label>
						<Input
							id="manifest-compiler"
							value={compilerVersion}
							onChange={(event) => setCompilerVersion(event.target.value)}
							placeholder="Not given"
							spellCheck={false}
							className="w-72 font-mono"
						/>
						<p className="text-muted-foreground text-xs">
							The single version a reading wallet ships. This page holds no wallet, so there is
							nothing here to read it from — and left blank, the compiler check is reported as not
							run rather than answered against a stand-in.
						</p>
					</div>
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
					{document.kind === "read" && document.ok && (
						<ContractSourceList
							contracts={document.contracts}
							onClear={() => setSuppliedSources([])}
							onSupply={setSuppliedSources}
							supplied={matched.sources}
							unmatched={matched.unmatched}
						/>
					)}
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
							title="What this wallet would do"
							description="Decided from the document alone, before anything is built."
						>
							<Verdict inspection={document} />
						</Panel>
						<Panel
							title="What each field is"
							description="Every field this document declares, against the position it sits in."
						>
							<div className="flex flex-col gap-6">
								<ConstructTable constructs={document.constructs} />
								<RewriteList rewrites={document.rewrites} />
							</div>
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
