import type { ManifestInspection, RejectToken } from "@humid/tx-manifest";

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

function spellingSentence(count: number): string {
	if (count === 0) {
		return "This document is written in the format's current spelling, so nothing was renamed on the way in.";
	}

	return (
		`${count} older spellings were accepted and renamed on the way in. They changed nothing about ` +
		"the answer above; the renamings themselves are listed with the fields below."
	);
}

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

function Names({ tokens }: { tokens: readonly string[] }) {
	return <p className="text-muted-foreground font-mono text-xs">{tokens.join(" · ")}</p>;
}
