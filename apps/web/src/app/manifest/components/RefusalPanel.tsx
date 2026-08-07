import type { ManifestInspection } from "@humid/tx-manifest";

import { Badge } from "@/components/ui/badge";

/**
 * The refusal, and — always beside it — what was never asked.
 *
 * The absence of a refusal here is the most misreadable thing on this page. A document can
 * be flawless in every way a document can be judged and still be unbuildable for want of
 * money, a fee rate, or the covenant actually being where the state file says. So the
 * unreached checks are not a footnote: they are rendered in the same panel, at the same
 * weight, whether or not a refusal was found.
 *
 * The second most misreadable thing was found by using this page on real documents. The
 * runtime returns one refusal and does so deliberately: a person deciding whether to trust a
 * site is not helped by a list of eleven field names. But a developer diagnosing coverage is
 * misled by it — five published protocols each refused on one decorative field, and each read
 * as hopeless when the truth was three fixable gaps. Saying how many fields are in that class
 * is not disagreeing with the runtime's choice; it is this page declining to let one stand in
 * for all of them.
 */
export function RefusalPanel({
	inspection,
}: {
	inspection: Pick<ManifestInspection, "constructs" | "refusal" | "skipped" | "unreachable">;
}) {
	const wouldRefuse = inspection.constructs.filter(
		(report) => report.state === "unimplemented" || report.state === "unrecognised",
	);
	return (
		<div className="flex flex-col gap-4">
			{(() => {
				if (!inspection.refusal) {
					return (
						<p className="text-sm">
							No refusal that a document alone can decide. This is not a statement that the wallet
							would build an action from it.
						</p>
					);
				}

				return (
					<div className="flex flex-col gap-2">
						<Badge variant="destructive" className="font-mono">
							{inspection.refusal.reject}
						</Badge>
						<p className="text-sm">{inspection.refusal.reason}</p>
						{wouldRefuse.length > 1 && (
							<p className="text-muted-foreground text-xs">
								{wouldRefuse.length} fields in this document would refuse, and the wallet names the
								first. The other {wouldRefuse.length - 1} are in the field table below, under
								unrecognised and unimplemented — fixing this one uncovers them rather than
								finishing.
							</p>
						)}
					</div>
				);
			})()}

			{inspection.skipped.length > 0 && (
				<Unasked
					heading="Not checked, because this page was not told what it needs"
					explanation="The compiler check needs the single SimplicityHL version a wallet ships, and this page ships none."
					tokens={inspection.skipped}
				/>
			)}

			<Unasked
				heading="Not checkable from a document at all"
				explanation="Each of these is decided against money, a chain read, a fee rate or a filled request. Reading a document establishes nothing about any of them."
				tokens={inspection.unreachable}
			/>
		</div>
	);
}

function Unasked({
	explanation,
	heading,
	tokens,
}: {
	explanation: string;
	heading: string;
	tokens: readonly string[];
}) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="text-sm font-medium">{heading}</h3>
			<p className="text-muted-foreground text-xs">{explanation}</p>
			<div className="flex flex-wrap gap-1">
				{tokens.map((token) => (
					<Badge key={token} variant="outline" className="font-mono">
						{token}
					</Badge>
				))}
			</div>
		</section>
	);
}
