import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, type RejectToken, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TXID = "b".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;

const deps = {
	accountLabel: "liquid:testnet account 0",
	compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
	fundingUtxos: [
		{ amount: "1000000", spendable: true, txOut: "00", txid: "c".repeat(64), vout: 0 },
	],
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate: async () => 1000,
	scriptPubKeyOf: () => DERIVED_SCRIPT,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

const chainHolding = (scriptPubKeyHex: string) => async (): Promise<TxOutAtOutPoint> => ({
	amountSats: "50000",
	rawAssetId: POLICY_ASSET,
	scriptPubKeyHex,
	txOutHex: `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`,
});

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: MANIFEST,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

function edited(edit: (manifest: Record<string, unknown>) => void): Record<string, unknown> {
	const copy = structuredClone(MANIFEST);

	edit(copy);

	return copy;
}

function actionNode(manifest: Record<string, unknown>, name: string): Record<string, unknown> {
	return (manifest.actions as Record<string, Record<string, unknown>>)[name] ?? {};
}

async function refusalOf(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
	dependencies: Partial<typeof deps> & { readTxOut?: () => Promise<TxOutAtOutPoint> } = {},
) {
	const result = await reviewManifestAction(request(overrides), {
		...deps,
		readTxOut: chainHolding(DERIVED_SCRIPT),
		...dependencies,
	});

	expect(isRefusal(result)).toBe(true);

	return isRefusal(result) ? result : undefined;
}

const spendRequest = (state?: unknown) =>
	({
		action: "Receive",
		params: { pubkey: PUBKEY },
		...(state === undefined ? {} : { state: state as Record<string, unknown> }),
	}) satisfies Partial<ParsedLiquidProcessCtParams>;

const oneCovenantUtxo = { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] };

describe("every refusal carries a name as well as a reason", () => {
	test("an action the manifest does not declare", async () => {
		const refusal = await refusalOf({ action: "Nope" });

		expect(refusal?.reject).toBe("no-such-action");
		expect(refusal?.reason).toContain("Nope");
	});

	test("a protocol for a chain this wallet does not build on", async () => {
		const refusal = await refusalOf({
			manifest: edited((manifest) => {
				manifest.chain = "bitcoin";
			}),
		});

		expect(refusal?.reject).toBe("foreign-chain");
	});

	test("a construct the format defines and this wallet does not implement", async () => {
		const refusal = await refusalOf({
			manifest: edited((manifest) => {
				actionNode(manifest, "Pay").on_validate = "assert!(true)";
			}),
		});

		expect(refusal?.reject).toBe("unimplemented-construct");
		expect(refusal?.reason).toContain("on_validate");
	});

	test("a construct no specification this wallet knows describes", async () => {
		const refusal = await refusalOf({
			manifest: edited((manifest) => {
				actionNode(manifest, "Pay").sacrifice_to = "the sea";
			}),
		});

		expect(refusal?.reject).toBe("unrecognised-construct");
		expect(refusal?.reason).toContain("sacrifice_to");
	});

	test("but not a construct that is known and decides nothing", async () => {
		const result = await reviewManifestAction(
			request({
				manifest: edited((manifest) => {
					actionNode(manifest, "Pay").$comment = "written by a person";
				}),
			}),
			{ ...deps, readTxOut: chainHolding(DERIVED_SCRIPT) },
		);

		expect(isRefusal(result)).toBe(false);
	});

	test("a build mode that is neither on nor off", async () => {
		const refusal = await refusalOf({
			manifest: edited((manifest) => {
				manifest.compile_debug_symbols = "maybe";
			}),
		});

		expect(refusal?.reject).toBe("unreadable-build-mode");
	});

	test("a compiler other than the one this wallet ships", async () => {
		const refusal = await refusalOf(
			{
				manifest: edited((manifest) => {
					manifest.simplicity_hl_version = "0.1.0";
				}),
			},
			{ compilerVersion: "0.6.0" } as Partial<typeof deps>,
		);

		expect(refusal?.reject).toBe("foreign-compiler");
	});

	test("a witness this wallet cannot produce", async () => {
		const refusal = await refusalOf({
			action: "Receive",
			manifest: edited((manifest) => {
				const inputs = actionNode(manifest, "Receive").inputs as Record<string, unknown>[];
				const witnesses = inputs[0]?.witnesses as Record<string, Record<string, unknown>>;

				(witnesses.SIGNATURE ?? {}).type = "PedersenProof";
			}),
			params: { pubkey: PUBKEY },
			state: oneCovenantUtxo,
		});

		expect(refusal?.reject).toBe("unproducible-witness");
	});

	test("a request missing something the action reads", async () => {
		const refusal = await refusalOf({ params: { amount_sat: 1000 } });

		expect(refusal?.reject).toBe("incomplete-request");
	});

	test("a state file naming no output for the covenant the action spends", async () => {
		const refusal = await refusalOf(spendRequest({ utxos: [] }));

		expect(refusal?.reject).toBe("no-utxo-to-spend");
	});

	test("a chain that could not be read", async () => {
		const refusal = await refusalOf(spendRequest(oneCovenantUtxo), {
			readTxOut: async () => {
				throw new Error("no endpoint");
			},
		});

		expect(refusal?.reject).toBe("chain-read-failed");
	});

	test("a covenant that is not what the chain says holds the money", async () => {
		const refusal = await refusalOf(spendRequest(oneCovenantUtxo), {
			readTxOut: chainHolding(ELSEWHERE_SCRIPT),
		});

		expect(refusal?.reject).toBe("covenant-mismatch");
	});

	test("a fee rate the wallet could not establish", async () => {
		const refusal = await refusalOf(
			{},
			{
				readFeeRate: async () => {
					throw new Error("no estimate");
				},
			},
		);

		expect(refusal?.reject).toBe("no-fee-rate");
	});

	test("an asset the wallet could not establish", async () => {
		const refusal = await refusalOf({
			manifest: edited((manifest) => {
				const outputs = actionNode(manifest, "Pay").outputs as Record<string, unknown>[];

				(outputs[0] ?? {}).asset = "params.nobody_supplied_this";
			}),
		});

		expect(refusal?.reject).toBe("foreign-asset");
	});

	for (const [what, rate] of [
		["a fee rate that is not a number", Number.NaN],
		["a fee rate with no upper bound", Number.POSITIVE_INFINITY],
		["a fee rate below zero", -1],
	] as const) {
		test(what, async () => {
			const refusal = await refusalOf({}, { readFeeRate: async () => rate });

			expect(refusal?.reject).toBe("no-fee-rate");
			expect(refusal?.reason).toContain(String(rate));
		});
	}

	test("but a fee rate of zero is a rate, and is built at", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readFeeRate: async () => 0,
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.feeRateSatsPerKvb).toBe(0);
		}
	});

	test("an account that cannot cover the action", async () => {
		const refusal = await refusalOf({}, { fundingUtxos: [] });

		expect(refusal?.reject).toBe("shortfall");
	});
});

describe("a declaration this runtime cannot read is refused, never passed over", () => {
	const cases: {
		edit: (pay: Record<string, unknown>) => void;
		reject: RejectToken;
		says?: string;
		what: string;
	}[] = [
		{
			edit: (pay) => {
				pay.validations = { amount_nonzero: { rule: { expr: "1 > 0", type: "arithmetic" } } };
			},
			reject: "document-fault",
			what: "rules written as a set rather than a list, which would check none of them",
		},
		{
			edit: (pay) => {
				(pay.inputs as unknown[])[0] = "funding_input";
			},
			reject: "document-fault",
			what: "an input that is not a declaration at all",
		},
		{
			edit: (pay) => {
				pay.params = ["pubkey", "amount_sat"];
			},
			reject: "document-fault",
			what: "parameters written as a list, which would fill none of them",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).witnesses = ["SIGNATURE"];
			},
			reject: "document-fault",
			what: "a witness block nothing can read, which the witness check would see none of",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).issuance = "new";
			},
			reject: "document-fault",
			what: "an issuance nothing can read, which would create no asset and say nothing",
		},
		{
			edit: (pay) => {
				pay.on_pre_broadcast = "params.locked = 1";
			},
			reject: "document-fault",
			what: "a hook that is not a block of assignments",
		},
		{
			edit: (pay) => {
				pay.on_pre_broadcast = { set: "params.locked = 1" };
			},
			reject: "document-fault",
			what: "a hook whose assignments are not a list of them",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).on_resolved = { sets: {} };
			},
			reject: "document-fault",
			what: "an input hook declaring nothing to set",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).required_index = 1.5;
			},
			reject: "unbuildable-position",
			says: "not a place in a transaction",
			what: "an input position that is not a place a transaction has",
		},
		{
			edit: (pay) => {
				((pay.outputs as Record<string, unknown>[])[0] ?? {}).required_index = "first";
			},
			reject: "unbuildable-position",
			says: "not a place in a transaction",
			what: "an output position written as a word",
		},
		{
			edit: (pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				delete (outputs[0] ?? {}).id;
				(outputs[0] ?? {}).required_index = 0;
			},
			reject: "unbuildable-position",
			says: "gives no id",
			what: "a positioned output the manifest gives no id, which nothing could be checked against",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).sequence = 1.5;
			},
			reject: "document-fault",
			what: "a sequence that is not a whole number",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).sequence = 4_294_967_296;
			},
			reject: "document-fault",
			what: "a sequence wider than the four bytes that hold one",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).sequence = {
					relative_blocks: Number.NaN,
				};
			},
			reject: "document-fault",
			what: "a relative timelock of no number of blocks",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).sequence = {
					relative_blocks: Number.POSITIVE_INFINITY,
				};
			},
			reject: "document-fault",
			what: "a relative timelock with no end",
		},
		{
			edit: (pay) => {
				((pay.inputs as Record<string, unknown>[])[0] ?? {}).sequence = { relative_blocks: 2.5 };
			},
			reject: "document-fault",
			what: "a relative timelock of part of a block",
		},
	];

	for (const { edit, reject, says, what } of cases) {
		test(what, async () => {
			const refusal = await refusalOf({
				manifest: edited((manifest) => {
					edit(actionNode(manifest, "Pay"));
				}),
			});

			expect(refusal?.reject).toBe(reject);

			if (says !== undefined) {
				expect(refusal?.reason).toContain(says);
			}
		});
	}
});

describe("what the chain reader says an output holds", () => {
	for (const amountSats of [
		"",
		"0x2710",
		"1.5",
		"-5",
		" 10",
		"010",
		"1e4",
		"99999999999999999999999999",
	]) {
		test(`${JSON.stringify(amountSats)} is refused rather than converted`, async () => {
			const refusal = await refusalOf(spendRequest(oneCovenantUtxo), {
				readTxOut: async () => ({
					amountSats,
					rawAssetId: POLICY_ASSET,
					scriptPubKeyHex: DERIVED_SCRIPT,
					txOutHex: `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`,
				}),
			});

			expect(refusal?.reject).toBe("unbuildable-utxo-type");
			expect(refusal?.reason).toContain("not an amount this wallet can read");
		});
	}
});
