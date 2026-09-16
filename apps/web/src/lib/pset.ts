import type { LiquidGetUTXOsResult, LiquidSignPsetInput } from "@humid/appkit-injected-adapter";
import { address, Creator, CreatorInput, CreatorOutput } from "liquidjs-lib";

type Utxo = LiquidGetUTXOsResult["utxos"][number];

const MAX_SAFE_SATS = BigInt(Number.MAX_SAFE_INTEGER);

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

export function splitAmounts(total: bigint, parts: number): bigint[] {
	if (parts < 1) throw new Error("Split needs at least one part.");
	const base = total / BigInt(parts);
	const remainder = total - base * BigInt(parts);
	return Array.from({ length: parts }, (_unused, index) => (index === 0 ? base + remainder : base));
}

export type CoinControlPlan = {
	inputs: Utxo[];
	outputAmounts: bigint[];
	feeSats: bigint;
	destinationAddress: string;
	policyAssetHex: string;
};

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
	const feeOutput = new CreatorOutput(plan.policyAssetHex, toSafeNumber(plan.feeSats, "fee"));

	const pset = Creator.newPset({ inputs, outputs: [...valueOutputs, feeOutput] });

	for (const input of pset.inputs) {
		input.requiredHeightLocktime = undefined;
		input.requiredTimeLocktime = undefined;
	}

	const signInputs: LiquidSignPsetInput[] = plan.inputs.map((utxo, index) => ({
		address: utxo.address,
		index,
	}));

	return { pset: pset.toBase64(), signInputs };
}
