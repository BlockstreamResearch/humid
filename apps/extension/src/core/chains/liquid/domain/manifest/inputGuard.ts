import { type OutPoint, spentInputs } from "./spentInputs";

export type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Checks the finished transaction spends only what it was supposed to.
 *
 * The wallet knows the whole expected set before the signing module runs: the covenant
 * inputs the action requires, which the runtime resolved and verified against the chain, and
 * the wallet outputs the wallet itself selected, because coin selection happens on this side.
 * Nothing else has any business being spent.
 *
 * The guard this replaces compared lwk's reported signatures before and after signing, which
 * needed lwk to be the signer. On this path it is not — the module blinds, signs and
 * finalises internally — so what is compared is which outpoints the finished transaction
 * spends. The shape is the same and worth keeping: an expected set against an observed one,
 * refusing on difference, rather than trusting that nothing went wrong.
 *
 * A missing input is a difference too. A transaction that spends less than the action
 * requires is not a safer version of it; it is a different transaction, and the covenant it
 * left out is one the person was shown.
 */
export function guardSpentInputs(
	transactionHex: string,
	expected: { covenantInputs: OutPoint[]; walletInputs: OutPoint[] },
): GuardResult {
	const observed = spentInputs(transactionHex);

	if (!observed.ok) {
		return { ok: false, reason: observed.reason };
	}

	const permitted = new Set(
		[...expected.covenantInputs, ...expected.walletInputs].map((outpoint) => key(outpoint)),
	);
	const seen = new Set(observed.spent.map((outpoint) => key(outpoint)));

	for (const outpoint of observed.spent) {
		if (!permitted.has(key(outpoint))) {
			return {
				ok: false,
				reason:
					`The signed transaction spends ${key(outpoint)}, which this action does not require ` +
					"and the wallet did not choose. Nothing is returned.",
			};
		}
	}

	for (const outpoint of [...expected.covenantInputs, ...expected.walletInputs]) {
		if (!seen.has(key(outpoint))) {
			return {
				ok: false,
				reason:
					`The signed transaction leaves out ${key(outpoint)}, which this action requires. ` +
					"Nothing is returned.",
			};
		}
	}

	return { ok: true };
}

function key(outpoint: OutPoint): string {
	return `${outpoint.txid}:${outpoint.vout}`;
}
