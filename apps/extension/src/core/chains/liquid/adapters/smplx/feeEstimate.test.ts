import { describe, expect, test } from "bun:test";

import { estimateVsize, type TransactionShape } from "@humid/tx-manifest";

import { smplx } from "./smplxWasmForTests";

const PHRASE =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const RATE_SATS_PER_KVB = 1000;

const POLICY = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const POLICY_IN_TXOUT = "499a818545f6bae39fc03b637f2a4e1e64e590cac1bc3a6f6d71aa4443654c14";

const TOLERANCE_VBYTES = 4n;

const COVENANT_INPUT_VBYTES = 87n;

type Shape = TransactionShape & { blinded: number };

function txOutPayingTheSigner(scriptPubKeyHex: string, sats: number): string {
	const asset = `01${POLICY_IN_TXOUT}`;
	const value = `01${sats.toString(16).padStart(16, "0")}`;
	const nonce = "00";
	const length = (scriptPubKeyHex.length / 2).toString(16).padStart(2, "0");

	return asset + value + nonce + length + scriptPubKeyHex;
}

function measure(declared: Shape): bigint {
	const signer = new smplx.WalletSigner(PHRASE, "liquidtestnet");

	try {
		const script = signer.scriptPubKeyHex();
		const blindingKey = signer.blindingPublicKey();
		const builder = new smplx.TransactionBuilder();

		try {
			for (let index = 0; index < declared.walletInputs; index += 1) {
				builder.addWalletInput(
					`${index.toString(16).padStart(2, "0")}${"ee".repeat(31)}`,
					0,
					txOutPayingTheSigner(script, 100_000),
					undefined,
					undefined,
				);
			}

			for (let index = 0; index < declared.outputs; index += 1) {
				builder.addOutput(
					script,
					1000n,
					POLICY,
					index < declared.blinded ? blindingKey : undefined,
				);
			}

			builder.addChange(script, declared.blinded > 0 ? blindingKey : undefined);

			return signer.estimateFee(builder, RATE_SATS_PER_KVB);
		} finally {
			builder.free();
		}
	} finally {
		signer.free();
	}
}

function shape(walletInputs: number, outputs: number, blinded: number): Shape {
	return { blinded, covenantInputs: 0, issuingInputs: 0, outputs, walletInputs };
}

describe("what the fee estimate says a transaction weighs, against what one weighs", () => {
	const shapes = [
		shape(1, 1, 0),
		shape(2, 1, 0),
		shape(1, 2, 0),
		shape(1, 4, 0),
		shape(3, 3, 0),
		shape(1, 1, 1),
		shape(1, 2, 2),
		shape(1, 4, 4),
		shape(3, 3, 3),
	];

	for (const declared of shapes) {
		const label =
			`${declared.walletInputs} in, ${declared.outputs} out` +
			(declared.blinded > 0 ? `, ${declared.blinded} blinded` : "");

		test(`${label} is estimated within ${TOLERANCE_VBYTES} bytes of what it weighs`, () => {
			const measured = measure(declared);
			const estimated = estimateVsize(declared);

			expect(estimated).toBeGreaterThanOrEqual(measured);
			expect(estimated - measured).toBeLessThanOrEqual(TOLERANCE_VBYTES);
		});
	}
});

describe("what blinding an output costs, measured", () => {
	test("nothing, at one output", () => {
		expect(measure(shape(1, 1, 1))).toBe(measure(shape(1, 1, 0)));
	});

	test("nothing, at four", () => {
		expect(measure(shape(1, 4, 4))).toBe(measure(shape(1, 4, 0)));
	});

	test("and nothing across more inputs either", () => {
		expect(measure(shape(3, 3, 3))).toBe(measure(shape(3, 3, 0)));
	});
});

describe("what a covenant input weighs, against the flat figure charged for one", () => {
	function measureCovenant(source: string, witnessJson?: string): bigint {
		const signer = new smplx.WalletSigner(PHRASE, "liquidtestnet");

		try {
			const script = signer.scriptPubKeyHex();
			const covenant = new smplx.Covenant(source, undefined, undefined, false);
			const covenantScript = covenant.scriptPubKeyHex("liquidtestnet");

			covenant.free();

			const builder = new smplx.TransactionBuilder();

			try {
				builder.addWalletInput(
					"ee".repeat(32),
					0,
					txOutPayingTheSigner(script, 100_000),
					undefined,
					undefined,
				);
				builder.addCovenantInput(
					"dd".repeat(32),
					0,
					txOutPayingTheSigner(covenantScript, 50_000),
					source,
					undefined,
					witnessJson,
					undefined,
					undefined,
					false,
				);
				builder.addOutput(script, 1000n, POLICY, undefined);
				builder.addChange(script, undefined);

				return signer.estimateFee(builder, RATE_SATS_PER_KVB) - measure(shape(1, 1, 0));
			} finally {
				builder.free();
			}
		} finally {
			signer.free();
		}
	}

	test("a contract that does nothing costs less than the flat figure", () => {
		const measured = measureCovenant("fn main() { }");

		expect(measured).toBeGreaterThan(0n);
		expect(measured).toBeLessThanOrEqual(COVENANT_INPUT_VBYTES);
	});

	test("and so does one that compares two witnesses", () => {
		const measured = measureCovenant(
			"fn main() { assert!(jet::eq_32(witness::A, witness::B)); }",
			JSON.stringify({ A: { type: "u32", value: "1" }, B: { type: "u32", value: "1" } }),
		);

		expect(measured).toBeGreaterThan(0n);
		expect(measured).toBeLessThanOrEqual(COVENANT_INPUT_VBYTES);
	});
});

describe("what each part of a transaction weighs", () => {
	test("a wallet input is 69 bytes", () => {
		expect(measure(shape(2, 1, 0)) - measure(shape(1, 1, 0))).toBe(69n);
	});

	test("an output is 67 bytes", () => {
		expect(measure(shape(1, 2, 0)) - measure(shape(1, 1, 0))).toBe(67n);
	});

	test("and everything else about the smallest transaction is 121", () => {
		expect(measure(shape(1, 1, 0)) - 69n - 67n).toBe(121n);
	});
});
