import { describe, expect, test } from "bun:test";

import { getWalletUtxosForAsset } from "./getUTXOs";
import { readExplicitWalletUtxos } from "./readExplicitWalletUtxos";
import { readOwnedWalletUtxos } from "./readOwnedWalletUtxos";

type OutputSpec = {
	amount: string;
	blinded: boolean;
	vout: number;
	chain?: number;
	height?: number;
	index?: number;
};

function walletTx(
	txid: string,
	outputs: OutputSpec[],
	spends: { txid: string; vout: number }[] = [],
) {
	const owned = (spec: OutputSpec) => ({
		address: () => ({ toString: () => `address:${txid}:${spec.vout}` }),
		extInt: () => spec.chain ?? 0,
		height: () => spec.height,
		wildcardIndex: () => spec.index ?? 0,
		outpoint: () => ({
			txid: () => ({ toString: () => txid }),
			vout: () => spec.vout,
		}),
		scriptPubkey: () => ({ toString: () => `script:${spec.vout}` }),
		unblinded: () => ({
			asset: () => ({ toString: () => "cc".repeat(32) }),
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

const walletAddress = (index: number) => ({
	address: () => ({ toString: () => `confidential-address-${index}` }),
});

const wollet = (txs: unknown[]) =>
	({
		address: walletAddress,
		transactions: () => txs,
		utxos: () => [],
	}) as never;

const A = "aa".repeat(32);
const B = "bb".repeat(32);

describe("the wallet's own outputs that hide nothing", () => {
	test("the public UTXO response includes an explicit redemption reserve", () => {
		const account = {
			chainId: "bip122:" + "11".repeat(16),
			implementation: {
				wollet: {
					address: walletAddress,
					utxos: () => [],
					transactions: () => [
						walletTx(A, [
							{ amount: "10000", blinded: true, height: 12, vout: 0 },
							{ amount: "1", blinded: true, height: 12, vout: 1 },
							{ amount: "2000", blinded: false, height: 12, vout: 2 },
						]),
					],
				},
			},
		} as never;

		expect(getWalletUtxosForAsset(account, "cc".repeat(32))).toMatchObject([
			{
				address: "confidential-address-0",
				amount: "2000",
				assetId: `bip122:${"11".repeat(16)}/elip144:${"cc".repeat(32)}`,
				confidential: false,
				spendable: true,
				txid: A,
				vout: 2,
			},
		]);
	});

	test("an unspent explicit output is reported", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([walletTx(A, [{ amount: "30000", blinded: false, height: 12, vout: 0 }])]),
		);

		expect(utxos).toHaveLength(1);
		expect(utxos[0]).toMatchObject({
			address: "confidential-address-0",
			amountSats: "30000",
			confidential: false,
			spendable: true,
			txid: A,
			txOut: `txout:${A}:0`,
			vout: 0,
		});
	});

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

	test("an explicit output at a later receive index is reported under its own key", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([walletTx(A, [{ amount: "30000", blinded: false, height: 1, index: 4, vout: 0 }])]),
		);

		expect(utxos).toMatchObject([{ address: "confidential-address-4", derivationPath: "0/4" }]);
	});

	test("an explicit change output is reported under its own key", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([walletTx(A, [{ amount: "30000", blinded: false, chain: 1, height: 1, vout: 0 }])]),
		);

		expect(utxos).toMatchObject([{ address: `address:${A}:0`, derivationPath: "1/0" }]);
	});

	test("spent explicit outputs at any key are gone", () => {
		const utxos = readExplicitWalletUtxos(
			wollet([
				walletTx(A, [
					{ amount: "30000", blinded: false, height: 1, index: 4, vout: 0 },
					{ amount: "20000", blinded: false, chain: 1, height: 1, vout: 1 },
					{ amount: "10000", blinded: false, height: 1, vout: 2 },
				]),
				walletTx(
					B,
					[],
					[
						{ txid: A, vout: 0 },
						{ txid: A, vout: 1 },
					],
				),
			]),
		);

		expect(utxos.map((utxo) => utxo.derivationPath)).toEqual(["0/0"]);
	});

	test("the portfolio snapshot and the backend fallback offer the same explicit outputs", () => {
		const txs = [
			walletTx(A, [
				{ amount: "10000", blinded: false, height: 1, vout: 0 },
				{ amount: "30000", blinded: false, height: 1, index: 4, vout: 1 },
				{ amount: "20000", blinded: false, chain: 1, height: 1, vout: 2 },
			]),
		];
		const account = {
			chainId: "bip122:" + "11".repeat(16),
			implementation: { wollet: wollet(txs) },
		} as never;

		const snapshot = readOwnedWalletUtxos(wollet(txs));
		const fallback = getWalletUtxosForAsset(account, "cc".repeat(32));

		expect(snapshot.map((utxo) => utxo.derivationPath)).toEqual(["0/0", "0/4", "1/0"]);
		expect(fallback.map(({ txid, vout }) => `${txid}:${vout}`)).toEqual(
			snapshot.map(({ txid, vout }) => `${txid}:${vout}`),
		);
	});

	test("an input the wallet did not own does not remove anything", () => {
		const tx = walletTx(A, [{ amount: "30000", blinded: false, height: 1, vout: 0 }]);
		const withForeignInput = {
			...tx,
			inputs: () => [{ get: () => undefined }],
		};

		expect(readExplicitWalletUtxos(wollet([withForeignInput]))).toHaveLength(1);
	});
});
