import type { Pset, PsetInput } from "lwk_wasm";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import type { LiquidSignPsetReview, ParsedLiquidSignPsetParams } from "../../../domain/pset/types";
import { loadLwkWasm } from "../loadLwkWasm";
import { getLwkImplementation } from "./getLwkImplementation";

export async function preparePsetSigning(
	account: LiquidWalletAccount,
	params: ParsedLiquidSignPsetParams,
): Promise<LiquidSignPsetReview> {
	const lwk = await loadLwkWasm();
	const { wollet } = getLwkImplementation(account);
	const originalPset = new lwk.Pset(params.pset);
	let pset: Pset;
	try {
		pset = wollet.blind(originalPset);
	} finally {
		originalPset.free();
	}
	let inputs: PsetInput[] = [];

	try {
		inputs = pset.inputs();
		const details = wollet.psetDetails(pset);

		try {
			const balance = details.balance();

			try {
				const fees = balance.fees();
				const balances = balance.balances();
				const recipients = balance.recipients();
				const outputs = pset.outputs();

				try {
					const addresses = new Map<number, string>();
					for (const recipient of recipients) {
						const address = recipient.address();
						if (address) {
							try {
								addresses.set(recipient.vout(), address.toString());
							} finally {
								address.free();
							}
						}
					}

					return {
						pset: pset.toString(),
						inputs: inputs.map((input, index) => ({ index, sighashType: input.sighash() })),
						fees: Array.from(fees.entries() as Map<string, bigint>, ([asset, amount]) => ({
							asset,
							amount: amount.toString(),
						})),
						netEffect: Array.from(balances.entries() as Map<string, bigint>, ([asset, amount]) => ({
							asset,
							amount: amount.toString(),
						})),
						outputs: outputs.map((output, index) => {
							const asset = output.asset();
							const script = output.scriptPubkey();

							try {
								return {
									address: addresses.get(index),
									amount: output.amount()?.toString(),
									asset: asset?.toString(),
									index,
									script: script.toString(),
								};
							} finally {
								asset?.free();
								script.free();
							}
						}),
					};
				} finally {
					for (const output of outputs) output.free();
					for (const recipient of recipients) recipient.free();
					balances.free();
					fees.free();
				}
			} finally {
				balance.free();
			}
		} finally {
			details.free();
		}
	} finally {
		for (const input of inputs) input.free();
		pset.free();
	}
}
