import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LIQUID_NETWORKS, liquidNetworkByChainId } from "@/lib/liquid-networks";

import { ConstructTable } from "./components/ConstructTable";
import { RefusalPanel } from "./components/RefusalPanel";
import { RewriteList } from "./components/RewriteList";
import { readDocument } from "./readDocument";

/**
 * Going back to no answer, which needs a value of its own because the empty string is how the
 * select spells "nothing chosen yet" and cannot also be an option. Neither resolves to a
 * network, which is the only thing the reader is told.
 */
const NO_NETWORK = "none";

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
 *
 * The network is asked for rather than read from anywhere, because a document names a chain
 * family and the two Liquid networks charge in different assets. Unanswered is a real state
 * and the one it opens in — the checks that need that asset are then reported as not run,
 * which is not the same as passing them.
 */
export default function ManifestInspector() {
	const [text, setText] = useState("");
	const [chosenChain, setChosenChain] = useState("");
	const network = useMemo(() => liquidNetworkByChainId(chosenChain), [chosenChain]);
	const document = useMemo(() => readDocument(text, { network }), [text, network]);

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
						<Label htmlFor="manifest-network">Network</Label>
						<Select value={chosenChain} onValueChange={setChosenChain}>
							<SelectTrigger id="manifest-network" className="w-72">
								<SelectValue placeholder="Not chosen" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_NETWORK}>Not chosen</SelectItem>
								{LIQUID_NETWORKS.map((candidate) => (
									<SelectItem key={candidate.chainId} value={candidate.chainId}>
										{candidate.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							A document says which chain family it is written for, never which network — and the
							two Liquid networks charge in different assets. Until you say which, the two checks
							that compare against that asset are reported as not run rather than passed.
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
