import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, type ManifestReview, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;

const deps = {
	accountLabel: "liquid:testnet account 0",
	compile: () => ({
		address: "tex1p_derived",
		cmr: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		scriptPubKeyHex: DERIVED_SCRIPT,
		tapleafHash: "1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e",
	}),
	fundingUtxos: [
		{ amount: "1000000", spendable: true, txOut: "00", txid: "c".repeat(64), vout: 0 },
	],
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate: async () => 1000,
	readTxOut: async (): Promise<TxOutAtOutPoint> => ({
		amountSats: "50000",
		rawAssetId: POLICY_ASSET,
		scriptPubKeyHex: DERIVED_SCRIPT,
		txOutHex: `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`,
	}),
	scriptPubKeyOf: () => DERIVED_SCRIPT,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

function payDocument(edit: (pay: Record<string, unknown>) => void): Record<string, unknown> {
	const copy = structuredClone(MANIFEST);
	const pay = (copy.actions as Record<string, Record<string, unknown>>).Pay ?? {};

	edit(pay);

	return copy;
}

async function reviewPay(
	manifest: Record<string, unknown>,
	params: Record<string, unknown> = { amount_sat: 1000, pubkey: PUBKEY },
) {
	return reviewManifestAction(
		{
			action: "Pay",
			broadcast: false,
			contractSources: { [SOURCE_PATH]: SOURCE },
			manifest,
			params,
		} satisfies ParsedLiquidProcessCtParams,
		deps,
	);
}

function paid(review: ManifestReview): bigint | undefined {
	return review.outputs.find((output) => output.id === "p2pk_out")?.sats;
}

describe("an amount the document works out rather than states", () => {
	test("is evaluated rather than refused as unreadable", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				(outputs[0] ?? {}).amount_sat = "params.amount_sat * 2 + 5";
			}),
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(2005n);
		}
	});

	test("refuses rather than wrapping when it leaves the 64-bit range", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				(outputs[0] ?? {}).amount_sat = "pow(2, 62) * 4";
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("64-bit range");
			expect(result.reject).toBe("document-fault");
		}
	});

	test("refuses a division by zero rather than answering it", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				(outputs[0] ?? {}).amount_sat = "params.amount_sat / 0";
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("divides by zero");
		}
	});

	test("refuses a negative exponent rather than leaving the call unexpanded", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				(outputs[0] ?? {}).amount_sat = "pow(2, 0 - 1)";
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("negative exponent");
		}
	});
});

describe("a rule the protocol states about its own action", () => {
	test("refuses the action in the protocol's own words when it is not met", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				pay.validations = [
					{
						error: { code: "INVALID_AMOUNT", message: "Amount must be greater than zero" },
						id: "amount_large_enough",
						rule: { expr: "params.amount_sat > 5000", type: "arithmetic" },
					},
				];
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("Amount must be greater than zero");
			expect(result.reject).toBe("document-fault");
		}
	});

	test("and refuses a kind of rule it cannot check at all", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				pay.validations = [{ id: "on_chain", rule: { type: "utxo_exists" } }];
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("on_chain");
		}
	});
});

describe("what fills a parameter nobody supplied", () => {
	test("a computed value, worked out from what the request did supply", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Record<string, unknown>>;
				const outputs = pay.outputs as Record<string, unknown>[];

				params.doubled = { compute: "params.amount_sat * 2", type: "u64" };
				(outputs[0] ?? {}).amount_sat = "params.doubled";
			}),
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(2000n);
		}
	});

	test("a literal default, when nothing computes it either", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Record<string, unknown>>;
				const outputs = pay.outputs as Record<string, unknown>[];

				params.tip = { default: 700, type: "u64" };
				(outputs[0] ?? {}).amount_sat = "params.tip";
			}),
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(700n);
		}
	});

	test("but never over a value the request supplied, however the document fills it", async () => {
		const document = payDocument((pay) => {
			const params = pay.params as Record<string, Record<string, unknown>>;
			const outputs = pay.outputs as Record<string, unknown>[];

			params.tip = { compute: "params.amount_sat * 9", default: 700, type: "u64" };
			(outputs[0] ?? {}).amount_sat = "params.tip";
		});
		const result = await reviewPay(document, { amount_sat: 1000, pubkey: PUBKEY, tip: 123 });

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(123n);
		}
	});

	test("and a computed value wins over the default beneath it", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Record<string, unknown>>;
				const outputs = pay.outputs as Record<string, unknown>[];

				params.tip = { compute: "params.amount_sat + 1", default: 700, type: "u64" };
				(outputs[0] ?? {}).amount_sat = "params.tip";
			}),
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(1001n);
		}
	});

	test("a value from this wallet's own key is refused by name, not reported as missing", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Record<string, unknown>>;

				params.signer = { source: { type: "wallet_key" }, type: "pubkey" };
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("unimplemented-construct");
			expect(result.reason).toContain("signer");
		}
	});
});

describe("the assignments an action runs before anything is built", () => {
	test("are folded back into scope, so an amount can read what one set", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				pay.on_pre_broadcast = { set: { "params.locked": "params.amount_sat * 3" } };
				(outputs[0] ?? {}).amount_sat = "params.locked";
			}),
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(3000n);
		}
	});

	test("in the order the document writes them, each seeing the one before it", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				pay.on_pre_broadcast = {
					set: { "params.half": "params.amount_sat / 2", "params.rest": "params.half + 7" },
				};
				(outputs[0] ?? {}).amount_sat = "params.rest";
			}),
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(paid(result)).toBe(507n);
		}
	});

	test("and a target this runtime cannot set refuses rather than quietly setting nothing", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				pay.on_pre_broadcast = { set: { "chain.height": "1" } };
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("chain.height");
		}
	});
});

describe("state an output covenant commits to", () => {
	async function leavesPaid(debt: string) {
		const seen: string[] = [];
		const manifest = payDocument((pay) => {
			pay.on_pre_broadcast = { set: { "params.debt": debt } };
		});
		const types = manifest.utxo_types as Record<string, { script: Record<string, unknown> }>;

		(types.p2pk_output ?? { script: {} }).script.extra_leaves = [
			{
				payload: [{ align: "right", endian: "be", pad_to: 32, type: "u64", value: "params.debt" }],
				type: "tapdata",
			},
		];

		const result = await reviewManifestAction(
			{
				action: "Pay",
				broadcast: false,
				contractSources: { [SOURCE_PATH]: SOURCE },
				manifest,
				params: { amount_sat: 1000, pubkey: PUBKEY },
			} satisfies ParsedLiquidProcessCtParams,
			{
				...deps,
				compile: (asked: { extraLeavesJson: string }) => {
					seen.push(asked.extraLeavesJson);

					return deps.compile();
				},
			},
		);

		return { leaves: seen.map((json) => JSON.parse(json) as string[]), result };
	}

	test("can be set by a hook, and the created covenant commits to what it set", async () => {
		const { leaves, result } = await leavesPaid("params.amount_sat * 2");

		expect(isRefusal(result)).toBe(false);
		expect(leaves).toEqual([[`${"00".repeat(24)}00000000000007d0`]]);
	});

	test("so a hook that sets a different value moves the covenant's state with it", async () => {
		const { leaves } = await leavesPaid("params.amount_sat * 3");

		expect(leaves).toEqual([[`${"00".repeat(24)}0000000000000bb8`]]);
	});
});

describe("a position the document states for a piece of the transaction", () => {
	test("is met where the wallet would have put it there anyway", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];
				const outputs = pay.outputs as Record<string, unknown>[];

				(inputs[0] ?? {}).required_index = 0;
				(outputs[0] ?? {}).required_index = 0;
			}),
		);

		expect(isRefusal(result)).toBe(false);
	});

	test("and refuses by name where the wallet would put it somewhere else", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];

				(inputs[0] ?? {}).required_index = 3;
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("unbuildable-position");
			expect(result.reason).toContain("funding_input");
		}
	});

	test("read from the end when the document counts that way", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Record<string, unknown>[];

				(outputs[0] ?? {}).required_index = -2;
			}),
		);

		expect(isRefusal(result)).toBe(false);
	});
});

describe("a witness value the document states outright", () => {
	test("is accepted with its type, and the names inside it resolved", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];

				(inputs[0] ?? {}).witnesses = {
					BRANCH: {
						simplicity_type: "Either<u32, ()>",
						type: "simplicityhl",
						value: "Left(params.amount_sat)",
					},
				};
			}),
		);

		expect(isRefusal(result)).toBe(false);
	});

	test("and a name inside it that resolves to nothing refuses rather than reaching a compiler", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];

				(inputs[0] ?? {}).witnesses = {
					BRANCH: {
						simplicity_type: "Either<u32, ()>",
						type: "simplicityhl",
						value: "Left(instance.NOBODY_WROTE_THIS)",
					},
				};
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("BRANCH");
		}
	});
});

describe("what an action requires of an input beyond where its money comes from", () => {
	test("a sequence that constrains nothing is carried without changing anything", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];

				(inputs[0] ?? {}).sequence = 4_294_967_294;
			}),
		);

		expect(isRefusal(result)).toBe(false);
	});

	test("but a relative timelock refuses, because one sequence covers every input", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];

				(inputs[0] ?? {}).sequence = { relative_blocks: 10 };
			}),
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("unimplemented-construct");
		}
	});

	test("an address the action pins funding to restricts what may fund it", async () => {
		const result = await reviewPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Record<string, unknown>[];

				(inputs[0] ?? {}).from_address = "params.borrower";
			}),
			{ amount_sat: 1000, borrower: "0014deadbeef", pubkey: PUBKEY },
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("no-funds-at-signing-address");
		}
	});

	test("and is funded from it where the wallet actually holds something there", async () => {
		const result = await reviewManifestAction(
			{
				action: "Pay",
				broadcast: false,
				contractSources: { [SOURCE_PATH]: SOURCE },
				manifest: payDocument((pay) => {
					const inputs = pay.inputs as Record<string, unknown>[];

					(inputs[0] ?? {}).from_address = "params.borrower";
				}),
				params: { amount_sat: 1000, borrower: WALLET_SCRIPT, pubkey: PUBKEY },
			},
			{
				...deps,
				fundingUtxos: [
					{
						amount: "1000000",
						scriptPubKeyHex: WALLET_SCRIPT,
						spendable: true,
						txOut: "00",
						txid: "c".repeat(64),
						vout: 0,
					},
				],
			},
		);

		expect(isRefusal(result)).toBe(false);
	});
});
