import type { ManifestInspection, RejectToken } from "@humid/tx-manifest";

/**
 * What this wallet would do with the document, and — always beside it — what was never asked.
 *
 * The answer leads. Everything the reader computed is available further down the page, but a
 * person holding a document is deciding one thing, and a page that opens with an inventory
 * makes them assemble the answer themselves out of parts that all look equally important.
 *
 * The absence of a refusal is the most misreadable thing here. A document can be flawless in
 * every way a document can be judged and still be unbuildable for want of money, a fee rate,
 * or the covenant actually being where the state file says. So the unreached checks are not a
 * footnote and never collapse: they are rendered in this same region, whether or not a refusal
 * was found, and a tab or a disclosure would put back exactly the misreading they prevent.
 *
 * The runtime's own names for its refusals stay reachable and stop being headlines. A person
 * cannot act on `unbuildable-utxo-type`; they can act on the sentence beside it, which names
 * the position in the document. A dozen of those names set as badges is the page shouting its
 * vocabulary at someone who came to ask a question.
 *
 * The second most misreadable thing is that the runtime returns one refusal and does so
 * deliberately: a person deciding whether to trust a site is not helped by a list of a dozen
 * field names. A developer diagnosing coverage is misled by it — a protocol refusing on one
 * decorative field reads as hopeless when the truth is a few fixable gaps. Saying how many
 * fields are in that class is not disagreeing with the runtime's choice; it is this page
 * declining to let one stand in for all of them.
 */
export function Verdict({
	inspection,
}: {
	inspection: Pick<
		ManifestInspection,
		"constructs" | "partial" | "refusal" | "rewrites" | "skipped" | "unreachable"
	>;
}) {
	const wouldRefuse = inspection.constructs.filter(
		(report) => report.state === "unimplemented" || report.state === "unrecognised",
	);

	return (
		<div className="flex flex-col gap-5">
			{(() => {
				if (!inspection.refusal) {
					return (
						<div className="flex flex-col gap-1">
							<p className="text-sm font-medium">
								Nothing a document alone can decide refuses this one.
							</p>
							<p className="text-muted-foreground text-sm">
								This is not a statement that the wallet would build an action from it. Read it with
								what was not checked, below.
							</p>
						</div>
					);
				}

				return (
					<div className="flex flex-col gap-1">
						<p className="text-sm font-medium">
							This wallet would refuse to build an action from this document.
						</p>
						<p className="text-sm">{inspection.refusal.reason}</p>
						{wouldRefuse.length > 1 && (
							<p className="text-muted-foreground text-sm">
								{wouldRefuse.length} fields in this document would refuse, and the wallet names the
								first. The other {wouldRefuse.length - 1} are in the field table below, under
								unrecognised and unimplemented — fixing this one uncovers them rather than
								finishing.
							</p>
						)}
						<Names tokens={[inspection.refusal.reject]} />
					</div>
				);
			})()}

			<p className="text-muted-foreground text-sm">
				{spellingSentence(inspection.rewrites.length)}
			</p>

			{inspection.skipped.length > 0 && (
				<Unasked
					heading="Not checked, because this page has not been given what they need"
					explanations={whyUnasked(inspection.skipped)}
					tokens={inspection.skipped}
				/>
			)}

			{inspection.partial.length > 0 && (
				<section className="flex flex-col gap-1">
					<h3 className="text-sm font-medium">Checked in one of the two places that decide it</h3>
					<p className="text-muted-foreground text-sm">
						A compiler version is declared twice: by the document, and by a directive inside each
						contract source. The document&rsquo;s own declaration was checked. These sources were
						not read, so what they ask for is unknown — which is not the same as agreeing. Open them
						above and the check completes.
					</p>
					{inspection.partial.map((check) => (
						<p key={check.reject} className="text-muted-foreground font-mono text-xs">
							{check.reject} · {check.unread.join(" · ")}
						</p>
					))}
				</section>
			)}

			<Unasked
				heading="Not decidable from a document at all"
				explanations={[
					`${inspection.unreachable.length} of this wallet's refusals are decided against money, a chain read, a fee rate or a filled request. Reading a document establishes nothing about any of them, and no page holding none of those can.`,
				]}
				tokens={inspection.unreachable}
			/>
		</div>
	);
}

/**
 * What the older spellings amount to, said once and in the verdict's own region.
 *
 * A renaming that succeeded changed nothing about the answer above it, which is precisely why
 * a panel of its own would be unreadable: it would report, at the weight of a finding, that
 * nothing had happened. What is worth knowing is that the document belongs to an earlier
 * generation of the format, and that is one sentence. A document needing none says so, because
 * an absent sentence and a document nobody checked look the same.
 */
function spellingSentence(count: number): string {
	if (count === 0) {
		return "This document is written in the format's current spelling, so nothing was renamed on the way in.";
	}

	return (
		`${count} older spellings were accepted and renamed on the way in. They changed nothing about ` +
		"the answer above; the renamings themselves are listed with the fields below."
	);
}

/**
 * Why each unrun check was not run, in the reader's own terms.
 *
 * Where the answer is the reader's to give, the sentence says so — an explanation that only
 * states what is absent leaves the page looking broken rather than waiting.
 */
function whyUnasked(skipped: readonly RejectToken[]): string[] {
	const explanations: string[] = [];

	if (skipped.includes("foreign-compiler")) {
		explanations.push(
			"The compiler check needs the single SimplicityHL version a wallet ships, and this page holds no wallet. Name it above and the check runs.",
		);
	}

	return explanations;
}

function Unasked({
	explanations,
	heading,
	tokens,
}: {
	explanations: readonly string[];
	heading: string;
	tokens: readonly string[];
}) {
	return (
		<section className="flex flex-col gap-1">
			<h3 className="text-sm font-medium">{heading}</h3>
			{explanations.map((explanation) => (
				<p key={explanation} className="text-muted-foreground text-sm">
					{explanation}
				</p>
			))}
			<Names tokens={tokens} />
		</section>
	);
}

/**
 * The runtime's own names for the checks just described.
 *
 * Present because a developer chasing one of these into the code needs the exact string, and
 * subordinate because nobody decides anything from it. Never a heading, never a badge, and
 * never collapsed — the sentence above is what is being said, and this is the address of it.
 */
function Names({ tokens }: { tokens: readonly string[] }) {
	return <p className="text-muted-foreground font-mono text-xs">{tokens.join(" · ")}</p>;
}
