import type { Pset, Wollet } from "lwk_wasm";

import type { LwkWasmModule } from "../loadLwkWasm";
import { invalidPset, PsetMaps } from "./PsetMaps";
import { WalletCoins } from "./WalletCoins";

export function blindPset(
	lwk: LwkWasmModule,
	wollet: Wollet,
	coins: WalletCoins,
	pset: Pset,
): Pset {
	const maps = PsetMaps.parse(pset.toString());
	const owned = maps.inputs.map((input) => coins.find(input.outpoint));
	for (const [index, coin] of owned.entries()) if (coin) maps.inputs[index]!.spend(coin.txOut);

	const targets = maps.outputs.filter((output) => output.isBlindingTarget);
	const pending = targets.filter((output) => !output.isBlinded);
	if (pending.length === 0) {
		const hydrated = maps.toString();
		return hydrated === pset.toString() ? pset : new lwk.Pset(hydrated);
	}
	if (pending.length !== targets.length || pending.some((output) => !output.isExplicit)) {
		throw invalidPset("Partially blinded PSETs must be completed by their original blinder.");
	}
	if (maps.hasBlindingContributions) {
		throw invalidPset("PSETs with existing blinding contributions are not supported.");
	}
	if (maps.inputs.some((input) => input.isSigned)) {
		throw invalidPset("PSET must be blinded before signing or finalizing its inputs.");
	}

	const secrets = maps.inputs.map((input, index) => {
		const coin = owned[index];
		if (coin) return WalletCoins.secretsOf(lwk, coin);
		if (!input.hasWitnessUtxo)
			throw invalidPset("Every input needs its witness UTXO before blinding.");
		const prevout = input.explicitPrevout;
		if (!prevout) {
			throw invalidPset("Cannot blind a foreign confidential input without its blinding secrets.");
		}
		return lwk.TxOutSecrets.fromExplicit(lwk.AssetId.fromString(prevout.asset), prevout.value);
	});
	for (const output of targets) output.assignBlinder();

	const unblinded = new lwk.Pset(maps.toString());
	let builder = lwk.PsetBuilder.newV2();
	for (const input of unblinded.inputs()) builder = builder.addInput(input);
	for (const output of unblinded.outputs()) builder = builder.addOutput(output);
	const blinded = builder.blindLast(Uint32Array.from(secrets.keys()), secrets).build();
	const result = new lwk.Pset(maps.withOutputsOf(PsetMaps.parse(blinded.toString())).toString());
	result.addDetails(wollet);
	return result;
}
