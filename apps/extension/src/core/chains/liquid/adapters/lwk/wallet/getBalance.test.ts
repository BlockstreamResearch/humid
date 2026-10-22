import { describe, expect, test } from "bun:test";

import { getWalletBalanceForAsset } from "./getBalance";
import { getWalletUtxosForAsset } from "./getUTXOs";
import { readWalletBalanceForAsset } from "./readWalletData";

const CHAIN_ID = `bip122:${"11".repeat(16)}`;
const ASSET = "cc".repeat(32);
const CONFIDENTIAL_TX = "aa".repeat(32);
const EXPLICIT_TX = "bb".repeat(32);

const text = (value: string) => ({ toString: () => value });

const secrets = (value: bigint) => ({
	asset: () => text(ASSET),
	assetBlindingFactor: () => text("ab".repeat(32)),
	value: () => value,
	valueBlindingFactor: () => text("cd".repeat(32)),
});

const confidentialUtxo = (value: bigint) => ({
	address: () => text("confidential-address"),
	extInt: () => 0,
	height: () => 12,
	outpoint: () => ({ txid: () => text(CONFIDENTIAL_TX), vout: () => 0 }),
	scriptPubkey: () => text("script-confidential"),
	unblinded: () => secrets(value),
	wildcardIndex: () => 1,
});

const explicitOutput = (value: bigint) => ({
	address: () => text("unconfidential-address"),
	extInt: () => 0,
	height: () => 12,
	outpoint: () => ({ txid: () => text(EXPLICIT_TX), vout: () => 0 }),
	scriptPubkey: () => text("script-explicit"),
	unblinded: () => secrets(value),
	wildcardIndex: () => 4,
});

function account({ confidential, explicit }: { confidential?: bigint; explicit?: bigint }) {
	const transactions = [
		...(confidential === undefined
			? []
			: [
					{
						inputs: () => [],
						outputs: () => [],
						tx: () => ({ outputs: [{ isPartiallyBlinded: () => true, toString: () => "raw" }] }),
						txid: () => text(CONFIDENTIAL_TX),
					},
				]),
		...(explicit === undefined
			? []
			: [
					{
						inputs: () => [],
						outputs: () => [{ get: () => explicitOutput(explicit) }],
						tx: () => ({ outputs: [{ isPartiallyBlinded: () => false, toString: () => "raw" }] }),
						txid: () => text(EXPLICIT_TX),
					},
				]),
	];
	const wollet = {
		address: (index: number) => ({ address: () => text(`address-${index}`) }),
		balance: () => ({
			entries: () => new Map(confidential === undefined ? [] : [[ASSET, confidential]]),
		}),
		transactions: () => transactions,
		utxos: () => (confidential === undefined ? [] : [confidentialUtxo(confidential)]),
	};

	return { chainId: CHAIN_ID, implementation: { wollet } } as never;
}

const utxoTotal = (target: never) =>
	getWalletUtxosForAsset(target, ASSET)
		.reduce((sum, utxo) => sum + BigInt(utxo.amount), 0n)
		.toString();

describe("the backend balance a dapp reads without a portfolio snapshot", () => {
	test("an asset held only as an explicit coin is reported", () => {
		const target = account({ explicit: 30_000n });

		expect(getWalletBalanceForAsset(target, ASSET)).toBe("30000");
		expect(getWalletBalanceForAsset(target, ASSET)).toBe(utxoTotal(target));
	});

	test("explicit and confidential coins of one asset add up", () => {
		const target = account({ confidential: 10_000n, explicit: 30_000n });

		expect(getWalletBalanceForAsset(target, ASSET)).toBe("40000");
		expect(getWalletBalanceForAsset(target, ASSET)).toBe(utxoTotal(target));
	});

	test("the amount Send can spend still leaves explicit coins out", () => {
		const target = account({ confidential: 10_000n, explicit: 30_000n }) as {
			implementation: { wollet: never };
		};

		expect(readWalletBalanceForAsset(target.implementation.wollet, CHAIN_ID, ASSET)).toBe("10000");
	});
});
