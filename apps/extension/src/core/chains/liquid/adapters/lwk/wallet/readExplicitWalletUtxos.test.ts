import { describe, expect, test } from "bun:test";

import { readExplicitWalletUtxos } from "./readExplicitWalletUtxos";

/**
 * A wallet built out of the shapes the chain library returns: each transaction reports which of
 * its outputs belong to the wallet and which of its inputs spent wallet outputs, and the raw
 * output says whether the amount is hidden.
 */
type OutputSpec = {
	amount: string;
	blinded: boolean;
	vout: number;
	height?: number;
};

function walletTx(
	txid: string,
	outputs: OutputSpec[],
	spends: { txid: string; vout: number }[] = [],
) {
	const owned = (spec: OutputSpec) => ({
		address: () => ({ toString: () => `address:${txid}:${spec.vout}` }),
		height: () => spec.height,
		outpoint: () => ({ txid: () => ({ toString: () => txid }), vout: () => spec.vout }),
		scriptPubkey: () => ({ toString: () => `script:${spec.vout}` }),
		unblinded: () => ({
			asset: () => ({ toString: () => "asset" }),
			value: () => ({ toString: () => spec.amount }),
		}),
	});

	return {
		inputs: () =>
			spends.map((spend) => ({
				get: () => ({
					outpoint: () => ({
						txid: () => ({ toString: () => spend.txid }),
						vout: () => spend.vout,
					}),
				}),
			})),
		outputs: () => outputs.map((spec) => ({ get: () => owned(spec) })),
		tx: () => ({
			outputs: outputs.map((spec) => ({
				isPartiallyBlinded: () => spec.blinded,
				toString: () => `txout:${txid}:${spec.vout}`,
			})),
		}),
		txid: () => ({ toString: () => txid }),
	};
}

const wollet = (txs: unknown[]) => ({ transactions: () => txs }) as never;

const A = "aa".repeat(32);
const B = "bb".repeat(32);

describe("the wallet's own outputs that hide nothing", () => {
	test("an unspent explicit output is reported", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([walletTx(A, [{ amount: "30000", blinded: false, height: 12, vout: 0 }])]),
		);

		expect(utxos).toHaveLength(1);
		expect(utxos[0]).toMatchObject({
			amountSats: "30000",
			confidential: false,
			spendable: true,
			txid: A,
			txOut: `txout:${A}:0`,
			vout: 0,
		});
	});

	// The ordinary read already reports these, and a wallet that counted them twice would
	// believe it has more money than it does.
	test("a blinded output is left to the ordinary read", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([walletTx(A, [{ amount: "30000", blinded: true, height: 12, vout: 0 }])]),
		);

		expect(utxos).toEqual([]);
	});

	test("an explicit output a later transaction spent is gone", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([
				walletTx(A, [{ amount: "30000", blinded: false, height: 12, vout: 0 }]),
				walletTx(
					B,
					[{ amount: "20000", blinded: false, height: 13, vout: 0 }],
					[{ txid: A, vout: 0 }],
				),
			]),
		);

		expect(utxos.map((utxo) => utxo.txid)).toEqual([B]);
	});

	// The spending transaction can be read before the one it spends from, and a reader that
	// decided as it went would report an output it had already been told was gone.
	test("order does not decide it", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([
				walletTx(
					B,
					[{ amount: "20000", blinded: false, height: 13, vout: 0 }],
					[{ txid: A, vout: 0 }],
				),
				walletTx(A, [{ amount: "30000", blinded: false, height: 12, vout: 0 }]),
			]),
		);

		expect(utxos.map((utxo) => utxo.txid)).toEqual([B]);
	});

	test("an output still in the mempool is reported, and not as spendable", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([walletTx(A, [{ amount: "30000", blinded: false, vout: 0 }])]),
		);

		expect(utxos[0]).toMatchObject({ spendable: false });
	});

	test("only the wallet's own outputs, never a counterparty's", () => {
		const tx = walletTx(A, [{ amount: "30000", blinded: false, height: 1, vout: 0 }]);
		const withStranger = {
			...tx,
			outputs: () => [...tx.outputs(), { get: () => undefined }],
			tx: () => ({
				outputs: [
					...tx.tx().outputs,
					{ isPartiallyBlinded: () => false, toString: () => "somebody-else" },
				],
			}),
		};

		const utxos = readExplicitWalletUtxos(wollet([withStranger]));

		expect(utxos).toHaveLength(1);
		expect(utxos[0]?.txOut).toBe(`txout:${A}:0`);
	});

	test("an input the wallet did not own does not remove anything", () => {
		const tx = walletTx(A, [{ amount: "30000", blinded: false, height: 1, vout: 0 }]);
		const withForeignInput = { ...tx, inputs: () => [{ get: () => undefined }] };

		expect(readExplicitWalletUtxos(wollet([withForeignInput]))).toHaveLength(1);
	});
});
