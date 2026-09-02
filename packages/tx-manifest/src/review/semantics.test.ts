import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, type ManifestReview, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

/**
 * What the runtime makes of the parts of a document that state a value rather than carry one.
 *
 * Every case here goes through `reviewManifestAction`, because the question each asks is what
 * gets built rather than what some evaluator returns: an expression the runtime read and then
 * dropped, a default that overwrote a chosen value, or a hook whose second line could not see
 * its first, are all invisible from inside the module that got them right.
 */

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;

const deps = {
	accountLabel: "liquid:testnet account 0",
	compile: () => ({ address: "tex1p_derived", scriptPubKeyHex: DERIVED_SCRIPT }),
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
	}),
	scriptPubKeyOf: () => DERIVED_SCRIPT,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

/** The published document with the Pay action edited, so each case differs in one thing. */
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

/** The covenant output the Pay action funds, which is the one carrying a stated amount. */
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

	// The three edges the reference implementation inherits from a Rust crate this runtime does
	// not use. Each of them silently produces a number if it is not checked, and a number
	// nobody chose is exactly what an amount must never be.
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

	// A rule this runtime cannot read is refused rather than skipped: a validation exists to
	// stop a transaction its protocol considers invalid, so ignoring one permits exactly what
	// it was written to prevent.
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

	// The order is the whole of the rule, and getting it wrong is invisible from the value
	// alone: a default and a supplied value are both perfectly good numbers.
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

	// The format says a later assignment may read an earlier one's result. Running them all
	// against one frozen scope produces a different transaction for exactly this document, and
	// nothing about the finished amount would say which reading had been used.
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

	// A covenant reads positions, so a transaction built in another order is one the network
	// rejects after it has been signed — which is the one failure a review exists to move
	// earlier.
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

				// Two outputs are built: the covenant and the change the module appends. The
				// covenant is therefore both the first and the second from the end.
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

	// One sequence is set for the whole transaction, so a relative timelock would land on the
	// wallet's own funding outputs too — against their age rather than this input's, which is a
	// different transaction that fails on broadcast instead of here.
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
