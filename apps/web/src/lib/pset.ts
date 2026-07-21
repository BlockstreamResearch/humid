// Coin-control PSET builder for the "Manage coins" action — the end-to-end exercise of the wallet's
// signPset. The dapp assembles an UNBLINDED elements PSET v2 (its inputs reference the wallet's own
// UTXOs, its outputs carry explicit asset/amount and the destination's blinding key) and hands it to
// signPset. It deliberately does NOT blind: balancing the confidential commitments needs the input
// blinding secrets that only the wallet holds, so the wallet blinds, signs and broadcasts.
//
// Amounts stay bigint base units through the math; the only narrowing to `number` is at the
// liquidjs-lib boundary (its CreatorOutput takes a JS number), guarded against the 2^53 range.
import type { LiquidGetUTXOsResult, LiquidSignPsetInput } from "@humid/appkit-injected-adapter";
import { address, Creator, CreatorInput, CreatorOutput } from "liquidjs-lib";

type Utxo = LiquidGetUTXOsResult["utxos"][number];

const MAX_SAFE_SATS = BigInt(Number.MAX_SAFE_INTEGER);

/** The 32-byte hex asset id inside a CAIP-ish `${chainId}/elip144:${hex}` (or a bare hex id). */
export function rawAssetId(assetId: string): string {
	const marker = "elip144:";
	const at = assetId.lastIndexOf(marker);
	return at === -1 ? assetId : assetId.slice(at + marker.length);
}

function toSafeNumber(sats: bigint, what: string): number {
	if (sats < 0n || sats > MAX_SAFE_SATS) {
		throw new Error(`${what} is out of the safe range: ${sats}`);
	}
	return Number(sats);
}

/** Split `total` into `parts` amounts as evenly as possible; any remainder lands on the first part. */
export function splitAmounts(total: bigint, parts: number): bigint[] {
	if (parts < 1) throw new Error("Split needs at least one part.");
	const base = total / BigInt(parts);
	const remainder = total - base * BigInt(parts);
	return Array.from({ length: parts }, (_unused, index) => (index === 0 ? base + remainder : base));
}

export type CoinControlPlan = {
	/** UTXOs to spend. All must share `policyAssetHex`. */
	inputs: Utxo[];
	/** Value output amounts in sats; must sum to (Σ inputs − fee). Each goes to `destinationAddress`. */
	outputAmounts: bigint[];
	/** Explicit fee in sats. */
	feeSats: bigint;
	/** Own confidential address that receives every value output (address reuse — acceptable here). */
	destinationAddress: string;
	/** The policy asset id (raw 32-byte display hex) shared by inputs, value outputs and the fee. */
	policyAssetHex: string;
};

/**
 * Build the unblinded PSET plus the matching `signInputs` (one per input, in order). Inputs carry
 * only their outpoint — the wallet rebuilds the confidential input side from its own state when it
 * blinds, so no `witness_utxo` is needed here.
 */
export function buildCoinControlPset(plan: CoinControlPlan): {
	pset: string;
	signInputs: LiquidSignPsetInput[];
} {
	if (plan.inputs.length === 0) throw new Error("Select at least one coin to spend.");
	if (plan.outputAmounts.length === 0) throw new Error("At least one output is required.");

	const decoded = address.fromConfidential(plan.destinationAddress);
	if (!decoded.scriptPubKey) {
		throw new Error("Destination is not a confidential Liquid address.");
	}

	const inputsSum = plan.inputs.reduce((sum, utxo) => sum + BigInt(utxo.amount), 0n);
	const outputsSum = plan.outputAmounts.reduce((sum, amount) => sum + amount, 0n);
	if (outputsSum + plan.feeSats !== inputsSum) {
		throw new Error(
			`Values do not balance: inputs ${inputsSum} ≠ outputs ${outputsSum} + fee ${plan.feeSats}.`,
		);
	}

	const inputs = plan.inputs.map((utxo) => new CreatorInput(utxo.txid, utxo.vout));

	// blinderIndex 0: every confidential output is blinded against the first input's context.
	const valueOutputs = plan.outputAmounts.map(
		(amount) =>
			new CreatorOutput(
				plan.policyAssetHex,
				toSafeNumber(amount, "output amount"),
				decoded.scriptPubKey,
				decoded.blindingKey,
				0,
			),
	);
	// A script-less output is the explicit fee; it carries no blinding key, so the wallet leaves it be.
	const feeOutput = new CreatorOutput(plan.policyAssetHex, toSafeNumber(plan.feeSats, "fee"));

	const pset = Creator.newPset({ inputs, outputs: [...valueOutputs, feeOutput] });

	const signInputs: LiquidSignPsetInput[] = plan.inputs.map((utxo, index) => ({
		address: utxo.address,
		index,
	}));

	return { pset: pset.toBase64(), signInputs };
}
