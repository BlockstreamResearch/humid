import { describe, expect, test } from "bun:test";

import type { ManifestReview } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import {
	COMPILED,
	type Document,
	Fixture,
	FUNDING_TXID,
	PUBKEY,
	refused,
	reviewed,
	utxo,
	WALLET_SCRIPT,
} from "./reviewForTests";

const p2pk = Fixture.load("p2pk");

const pay = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Pay", { params: { amount_sat: 1000, pubkey: PUBKEY }, ...overrides });

const payDocument = (edit: (pay: Document) => void) => p2pk.editedAction("Pay", edit).manifest;

const payWith = (manifest: Document, params?: Record<string, unknown>) =>
	pay(params === undefined ? { manifest } : { manifest, params });
const reviewedPay = (manifest: Document, params?: Record<string, unknown>) =>
	reviewed(payWith(manifest, params));
const refusedPay = (manifest: Document, params?: Record<string, unknown>) =>
	refused(payWith(manifest, params));

function paid(review: ManifestReview): bigint | undefined {
	return review.outputs.find((output) => output.id === "p2pk_out")?.sats;
}

describe("an amount the document works out rather than states", () => {
	test("is evaluated rather than refused as unreadable", async () => {
		const review = await reviewedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				(outputs[0] ?? {}).amount_sat = "params.amount_sat * 2 + 5";
			}),
		);

		expect(paid(review)).toBe(2005n);
	});

	test("refuses rather than wrapping when it leaves the 64-bit range", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				(outputs[0] ?? {}).amount_sat = "pow(2, 62) * 4";
			}),
		);

		expect(refusal.reason).toContain("64-bit range");
		expect(refusal.reject).toBe("document-fault");
	});

	test("refuses a division by zero rather than answering", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				(outputs[0] ?? {}).amount_sat = "params.amount_sat / 0";
			}),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("divides by zero");
	});

	test("refuses a negative exponent rather than leaving the call unexpanded", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				(outputs[0] ?? {}).amount_sat = "pow(2, 0 - 1)";
			}),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("negative exponent");
	});
});

describe("what fills a parameter nobody supplied", () => {
	test("a computed value, worked out from what the request did supply", async () => {
		const review = await reviewedPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Document>;
				const outputs = pay.outputs as Document[];

				params.doubled = { compute: "params.amount_sat * 2", type: "u64" };
				(outputs[0] ?? {}).amount_sat = "params.doubled";
			}),
		);

		expect(paid(review)).toBe(2000n);
	});

	test("a literal default, when nothing computes it either", async () => {
		const review = await reviewedPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Document>;
				const outputs = pay.outputs as Document[];

				params.tip = { default: 700, type: "u64" };
				(outputs[0] ?? {}).amount_sat = "params.tip";
			}),
		);

		expect(paid(review)).toBe(700n);
	});

	test("but never over a value the request supplied, however the document fills the parameter", async () => {
		const document = payDocument((pay) => {
			const params = pay.params as Record<string, Document>;
			const outputs = pay.outputs as Document[];

			params.tip = { compute: "params.amount_sat * 9", default: 700, type: "u64" };
			(outputs[0] ?? {}).amount_sat = "params.tip";
		});
		const review = await reviewedPay(document, { amount_sat: 1000, pubkey: PUBKEY, tip: 123 });

		expect(paid(review)).toBe(123n);
	});

	test("and a computed value wins over the parameter's default", async () => {
		const review = await reviewedPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Document>;
				const outputs = pay.outputs as Document[];

				params.tip = { compute: "params.amount_sat + 1", default: 700, type: "u64" };
				(outputs[0] ?? {}).amount_sat = "params.tip";
			}),
		);

		expect(paid(review)).toBe(1001n);
	});

	test("a value from this wallet's own key is refused by name, not reported as missing", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const params = pay.params as Record<string, Document>;

				params.signer = { compute: { type: "wallet", wallet: "pubkey" }, type: "pubkey" };
			}),
		);

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("signer");
	});
});

describe("the assignments an action runs before anything is built", () => {
	test("are folded back into scope, so an amount can read what one set", async () => {
		const review = await reviewedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				pay.on_pre_broadcast = { set: { "params.locked": "params.amount_sat * 3" } };
				(outputs[0] ?? {}).amount_sat = "params.locked";
			}),
		);

		expect(paid(review)).toBe(3000n);
	});

	test("in the order the document writes them, each seeing the ones before", async () => {
		const review = await reviewedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				pay.on_pre_broadcast = {
					set: { "params.half": "params.amount_sat / 2", "params.rest": "params.half + 7" },
				};
				(outputs[0] ?? {}).amount_sat = "params.rest";
			}),
		);

		expect(paid(review)).toBe(507n);
	});

	test("and a target this runtime cannot set refuses rather than quietly setting nothing", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				pay.on_pre_broadcast = { set: { "chain.height": "1" } };
			}),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("chain.height");
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

		await reviewed(pay({ manifest }), {
			compile: (asked) => {
				seen.push(asked.extraLeavesJson);

				return COMPILED;
			},
		});

		return seen.map((json) => JSON.parse(json) as string[]);
	}

	test("can be set by a hook, and the created covenant commits to what it set", async () => {
		expect(await leavesPaid("params.amount_sat * 2")).toEqual([
			[`${"00".repeat(24)}00000000000007d0`],
		]);
	});

	test("so a hook that sets a different value moves the covenant's state too", async () => {
		expect(await leavesPaid("params.amount_sat * 3")).toEqual([
			[`${"00".repeat(24)}0000000000000bb8`],
		]);
	});
});

describe("a position the document states for a piece of the transaction", () => {
	test("is met where the wallet would have put it there anyway", async () => {
		await reviewedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];
				const outputs = pay.outputs as Document[];

				(inputs[0] ?? {}).required_index = 0;
				(outputs[0] ?? {}).required_index = 0;
			}),
		);
	});

	test("and refuses by name where the wallet would put it somewhere else", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];

				(inputs[0] ?? {}).required_index = 3;
			}),
		);

		expect(refusal.reject).toBe("unbuildable-position");
		expect(refusal.reason).toContain("funding_input");
	});

	test("read from the end when the document counts that way", async () => {
		await reviewedPay(
			payDocument((pay) => {
				const outputs = pay.outputs as Document[];

				(outputs[0] ?? {}).required_index = -2;
			}),
		);
	});
});

describe("a witness value the document states outright", () => {
	test("is accepted with its type, and the names inside it resolved", async () => {
		await reviewedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];

				(inputs[0] ?? {}).witnesses = {
					BRANCH: {
						simplicity_type: "Either<u32, ()>",
						type: "simplicityhl",
						value: "Left(params.amount_sat)",
					},
				};
			}),
		);
	});

	test("and a name inside it that resolves to nothing refuses rather than reaching a compiler", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];

				(inputs[0] ?? {}).witnesses = {
					BRANCH: {
						simplicity_type: "Either<u32, ()>",
						type: "simplicityhl",
						value: "Left(instance.NOBODY_WROTE_THIS)",
					},
				};
			}),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("BRANCH");
	});
});

describe("what an action requires of an input beyond where its money comes from", () => {
	test("a sequence that constrains nothing is carried without changing anything", async () => {
		await reviewedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];

				(inputs[0] ?? {}).sequence = 4_294_967_294;
			}),
		);
	});

	test("but a relative timelock on a wallet input refuses", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];

				(inputs[0] ?? {}).sequence = { relative_blocks: 10 };
			}),
		);

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("would inherit that wait");
	});

	test("an address the action pins funding to restricts what may fund the action", async () => {
		const refusal = await refusedPay(
			payDocument((pay) => {
				const inputs = pay.inputs as Document[];

				(inputs[0] ?? {}).from_address = "params.borrower";
			}),
			{ amount_sat: 1000, borrower: "0014deadbeef", pubkey: PUBKEY },
		);

		expect(refusal.reject).toBe("no-funds-at-signing-address");
	});

	test("and is funded from it where the wallet actually holds something there", async () => {
		const manifest = payDocument((pay) => {
			((pay.inputs as Document[])[0] ?? {}).from_address = "params.borrower";
		});

		await reviewed(
			pay({
				manifest,
				params: { amount_sat: 1000, borrower: WALLET_SCRIPT, pubkey: PUBKEY },
			}),
			{ fundingUtxos: [utxo("1000000", FUNDING_TXID, { scriptPubKeyHex: WALLET_SCRIPT })] },
		);
	});
});
