/** Warns that an input mints an asset. Amounts arrive labelled; an unproven one is undefined. */
export function issuanceNote(
	position: number,
	issuance: { minted?: string; reissues: boolean; tokens?: string },
): string {
	const minted = issuance.minted ?? "a confidential amount";

	if (issuance.reissues) {
		return `Input ${position} reissues an asset: ${minted} will get minted.`;
	}

	const tokens = issuance.tokens === undefined ? "" : ` and ${issuance.tokens} reissuance tokens`;

	return `Input ${position} issues a new asset: ${minted}${tokens} will get minted.`;
}
