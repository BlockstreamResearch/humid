import { describe, expect, test } from "bun:test";

import groupedManifest from "../__fixtures__/p2pk-grouped.manifest.json";
import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { deriveNewIssuance } from "../chain/issuance";
import { txOutAt } from "../chain/txOut";
import { estimateFeeSats } from "../fee";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { isRefusal, reviewManifestAction } from "./index";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE =
	"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
const TXID = "b".repeat(64);
const DERIVED = "tex1p_derived";
// A compile yields both spellings of where the covenant is. They are distinct on purpose:
// the address is what a person is shown and what an on-chain output is compared against,
// the scriptPubKey is what an output pays to, and only one of them is hex.
const DERIVED_SCRIPT = "5120" + "11".repeat(32);
/** A script that is not the covenant's, for the cases where the chain must disagree. */
const UNSPENT_ELSEWHERE = "5120" + "22".repeat(32);
const COMPILED = { address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT };

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: p2pkManifest as unknown as Record<string, unknown>,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

const compile = () => COMPILED;
const WALLET_SCRIPT = "0014" + "11".repeat(20);
const readFeeRate = async () => 1000;
const fundingUtxos = [
	{ amount: "1000000", spendable: true, txid: "c".repeat(64), txOut: "00", vout: 0 },
];

/** The three dependencies every case shares; individual tests override what they exercise. */
const deps = {
	accountLabel: "liquid:testnet account 0",
	compile,
	compilerVersion: "0.6.0",
	policyAsset: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
	fundingUtxos,
	network: "liquid",
	readFeeRate,
	// The p2pk manifest computes nothing, so this is never reached on these cases; a
	// covenant hash the manifest works out for itself is covered where it is built.
	scriptPubKeyOf: () => "5120aabb",
	walletScriptPubKeyHex: WALLET_SCRIPT,
};
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
/**
 * A chain read that answers with bytes rather than with an object shaped like an answer.
 *
 * It serialises a real one-output transaction and reads it back through the parser the
 * production reader uses, so this substitute cannot return anything the real one could not:
 * an output it builds wrongly fails here rather than passing through green and failing in a
 * browser. Three faults reached a person through substitutes laxer than what they stood for.
 */
const readTxOut =
	(scriptPubKeyHex: string, amountSats = "42000") =>
	async (): Promise<TxOutAtOutPoint> => {
		const asset = `01${(POLICY_ASSET.match(/../g) ?? []).toReversed().join("")}`;
		const value = `01${BigInt(amountSats).toString(16).padStart(16, "0")}`;
		const script = `${(scriptPubKeyHex.length / 2).toString(16).padStart(2, "0")}${scriptPubKeyHex}`;
		const transaction = `02000000000001${asset}${value}00${script}00000000`;
		const parsed = txOutAt(transaction, 0);

		if (!parsed.ok) {
			throw new Error(`This substitute built an output the parser cannot read: ${parsed.reason}`);
		}

		return parsed.txOut;
	};

const spendRequest = (state: unknown) =>
	request({
		action: "Receive",
		params: { pubkey: PUBKEY },
		state: state as Record<string, unknown>,
	});

const oneCovenantUtxo = {
	utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }],
};

describe("reviewManifestAction", () => {
	// Pay creates a covenant output. There is nothing on chain yet, so the wallet reports
	// what it derived and says plainly that it has not compared it against anything.
	describe("creating a covenant", () => {
		test("reports the derived address as not yet on chain", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: readTxOut(UNSPENT_ELSEWHERE),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants).toEqual([
					{
						address: DERIVED,
						role: "created",
						scriptPubKeyHex: DERIVED_SCRIPT,
						utxoType: "p2pk_output",
						verified: "not-yet-on-chain",
					},
				]);
			}
		});

		test("never consults the chain for something that does not exist yet", async () => {
			let asked = 0;

			await reviewManifestAction(request(), {
				...deps,
				readTxOut: async () => {
					asked += 1;

					return { scriptPubKeyHex: "00", txOutHex: "00" };
				},
			});

			expect(asked).toBe(0);
		});
	});

	// Receive spends the covenant. This is where the wallet's derivation is checked against
	// something it did not get from the requester.
	describe("spending a covenant", () => {
		test("passes when the rebuilt contract lands where the funds are", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants[0]).toMatchObject({
					role: "spent",
					verified: "matches-chain",
				});
			}
		});

		// A transaction that verified a covenant and then did not spend it would be a
		// silently different transaction from the one reviewed.
		test("carries the covenant it verified, ready to be spent", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenantInputs).toHaveLength(1);
				expect(result.covenantInputs[0]).toMatchObject({ txid: TXID, vout: 0 });
				// The source it carries is the one that was verified, not a second read.
				expect(result.covenantInputs[0]?.source).toBe(SOURCE);
			}
		});

		// A covenant output cannot be confidential — Simplicity cannot read a confidential
		// commitment — so one that comes back without an explicit amount is a refusal rather
		// than something to encode a guess for.
		test("refuses a covenant output the chain reports as confidential", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: async () => {
					// A real confidential output: the asset and the value are commitments rather
					// than numbers, and a nonce is present. Built as bytes and read back, so this
					// is what the chain would actually hand over.
					const asset = `0a${"33".repeat(32)}`;
					const value = `08${"44".repeat(32)}`;
					const nonce = `02${"55".repeat(32)}`;
					const script = `${(DERIVED_SCRIPT.length / 2).toString(16).padStart(2, "0")}${DERIVED_SCRIPT}`;
					const parsed = txOutAt(`02000000000001${asset}${value}${nonce}${script}00000000`, 0);

					if (!parsed.ok) {
						throw new Error(parsed.reason);
					}

					return parsed.txOut;
				},
			});

			expect(isRefusal(result)).toBe(true);
		});

		// The output pays out what the covenant holds, and what it holds is read from the
		// chain — so a request understating the balance cannot make the wallet pay less.
		test("pays out the amount the chain reports, not one the request supplied", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut(DERIVED_SCRIPT, "77000"),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs).toContainEqual({
					// The document says nothing about hiding this one, and on this network silence
					// means hidden.
					blinded: true,
					id: "received_out",
					sats: 77_000n,
					scriptPubKeyHex: WALLET_SCRIPT,
				});
			}
		});

		test("refuses when the funds are somewhere else", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut(UNSPENT_ELSEWHERE),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses when the state file lists no such covenant", async () => {
			const result = await reviewManifestAction(spendRequest({ utxos: [] }), {
				...deps,
				readTxOut: readTxOut(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses when the chain cannot be read, rather than proceeding unchecked", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: async () => {
					throw new Error("offline");
				},
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses before reading anything when the state file is absent", async () => {
			const result = await reviewManifestAction(
				request({ action: "Receive", params: { pubkey: PUBKEY } }),
				{ ...deps, readTxOut: readTxOut(DERIVED_SCRIPT) },
			);

			expect(isRefusal(result)).toBe(true);
		});
	});

	test("refuses a request missing a part the action needs, naming it", async () => {
		const result = await reviewManifestAction(request({ contractSources: {} }), {
			...deps,
			readTxOut: readTxOut(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});

	test("refuses when the contract does not compile", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			compile: () => {
				throw new Error("parse error");
			},
			readTxOut: readTxOut(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);
	});
});

// The runtime core, observed where it actually matters: at the seam the wallet method
// calls, not only in the units beneath it.
describe("reviewManifestAction reads through the runtime core", () => {
	const grouped = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
		request({
			manifest: groupedManifest as unknown as Record<string, unknown>,
			...overrides,
		});

	// AC-10 at the review seam: the grouped twin of the published manifest is reviewed
	// into the same transaction, so nothing a person is shown depends on which shape the
	// site chose.
	test("reviews a grouped manifest into the same result as the flat one", async () => {
		const flat = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});
		const fromGrouped = await reviewManifestAction(grouped(), {
			...deps,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		expect(isRefusal(fromGrouped)).toBe(false);

		if (!isRefusal(flat) && !isRefusal(fromGrouped)) {
			expect(fromGrouped.covenants).toEqual(flat.covenants);
			expect(fromGrouped.outputs).toEqual(flat.outputs);
			expect(fromGrouped.selected).toEqual(flat.selected);
		}
	});

	test("reports the legacy spelling the grouped document used", async () => {
		const result = await reviewManifestAction(grouped(), {
			...deps,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		if (!isRefusal(result)) {
			expect(result.normalisation).toContainEqual({
				at: "manifest",
				canonical: "manifest_version",
				found: "compose_version",
			});
		}
	});

	// AC-02, decorative half: the published manifest carries attestation_version, which no
	// implementation reads. Ignoring it is right; ignoring it without saying so is not.
	test("records the constructs it ignored rather than dropping them", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		if (!isRefusal(result)) {
			expect(result.ignoredConstructs.map((finding) => finding.key)).toContain(
				"attestation_version",
			);
		}
	});

	test("keeps a load-bearing construct out of the ignored list", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		if (!isRefusal(result)) {
			expect(result.ignoredConstructs.map((finding) => finding.key)).not.toContain("validations");
		}
	});
});

// AC-13: the fee and the fee rate are the wallet's alone.
describe("who decides the fee", () => {
	test("the rate comes from the chain, not from the request", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readFeeRate: async () => 1234,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.feeRateSatsPerKvb).toBe(1234);
		}
	});

	test("refuses rather than defaulting when no rate can be established", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readFeeRate: async () => {
				throw new Error("no estimate");
			},
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("fee rate");
	});
});

// AC-09: an amount that is a function of the fee is worked out against the fee the wallet
// established, and the transaction it produces is the one the person is shown.
describe("an amount that depends on the fee", () => {
	// A one-input, one-output spend of the covenant, paying out what it holds less the fee.
	const feeAware = {
		actions: {
			Sweep: {
				inputs: [
					{
						id: "cov_in",
						utxo_source: { compile_params: { PUB_KEY: "params.pubkey" }, utxo_type: "p2pk_output" },
						witnesses: {
							SIGNATURE: { source: { key: "params.pubkey", type: "wallet" }, type: "Signature" },
						},
					},
				],
				outputs: [{ amount_sat: "cov_in.amount_sat - fee", destination: "wallet", id: "swept" }],
				params: { pubkey: { type: "pubkey" } },
			},
		},
		protocol: "p2pk-simplicity",
		utxo_types: {
			p2pk_output: { script: { source: SOURCE_PATH, type: "simplicity" } },
		},
	};

	const sweep = () =>
		reviewManifestAction(
			request({
				action: "Sweep",
				manifest: feeAware,
				params: { pubkey: PUBKEY },
				state: oneCovenantUtxo as Record<string, unknown>,
			}),
			{ ...deps, readTxOut: readTxOut(DERIVED_SCRIPT, "42000") },
		);

	test("pays out what the covenant holds, less what the wallet worked the fee out to be", async () => {
		const result = await sweep();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.outputs[0]?.sats).toBe(42_000n - result.estimatedFeeSats);
		}
	});

	test("the fee it used is the one its own shape costs at the rate it read", async () => {
		const result = await sweep();

		if (!isRefusal(result)) {
			// One covenant input, one output, and the wallet input the estimate assumes.
			expect(result.estimatedFeeSats).toBe(
				estimateFeeSats(
					{ covenantInputs: 1, outputs: 1, walletInputs: 1 },
					result.feeRateSatsPerKvb,
				),
			);
		}
	});

	test("carries the witness the covenant needs a signature for", async () => {
		const result = await sweep();

		if (!isRefusal(result)) {
			expect(result.covenantInputs[0]?.signatureWitness).toBe("SIGNATURE");
		}
	});
});

// AC-06 and AC-07 at the seam. What the person is shown is built where what the wallet
// established is known, so nothing downstream has to guess which values were the site's word.
describe("what the person is shown", () => {
	const shown = async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		return result.confirmation;
	};

	// AC-06: the four wallet-established facts.
	test("names which account is acting, because the wallet chose it implicitly", async () => {
		expect((await shown()).account).toMatchObject({
			origin: "computed",
			value: "liquid:testnet account 0",
		});
	});

	test("shows what the wallet worked the fee out to be", async () => {
		const model = await shown();

		expect(model.feeSats.value > 0n).toBe(true);
		expect(model.feeSats.origin).toBe("computed");
	});

	test("shows the net effect on this wallet, as an outgoing figure", async () => {
		const [effect] = (await shown()).netEffect;

		expect(effect?.sats.value).toBeLessThan(0n);
		expect(effect?.asset.origin).toBe("computed");
	});

	test("says whether the wallet checked each covenant against the network", async () => {
		const [covenant] = (await shown()).covenants;

		expect(covenant?.verified).toMatchObject({ origin: "computed", value: false });
	});

	test("and marks a covenant it did check as checked", async () => {
		const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
			...deps,
			readTxOut: readTxOut(DERIVED_SCRIPT),
		});

		if (!isRefusal(result)) {
			expect(result.confirmation.covenants[0]?.verified.value).toBe(true);
			expect(result.confirmation.covenants[0]?.address.origin).toBe("verified");
		}
	});

	// AC-07: the site's text is the site's, and says so.
	test("attributes the protocol's name to the site", async () => {
		expect((await shown()).protocol.origin).toBe("site");
	});

	test("attributes the action's name to the site", async () => {
		expect((await shown()).action.origin).toBe("site");
	});

	test("attributes the protocol's own summary to the site", async () => {
		expect((await shown()).summary?.origin).toBe("site");
	});

	test("the utxo type is the protocol's own word for it, and is marked so", async () => {
		expect((await shown()).covenants[0]?.utxoType.origin).toBe("site");
	});
});

// AC-15 through the whole path: the wallet builds each contract the way its own protocol
// declares, and the declaration reaches the compiler rather than stopping at a flag.
describe("the mode a protocol declares reaches the compiler", () => {
	function withMode(compile_debug_symbols?: boolean) {
		const seen: boolean[] = [];
		const manifest = {
			...(p2pkManifest as unknown as Record<string, unknown>),
			...(compile_debug_symbols === undefined ? {} : { compile_debug_symbols }),
		};

		return reviewManifestAction(request({ manifest }), {
			...deps,
			compile: (input) => {
				seen.push(input.includeDebugSymbols);

				return COMPILED;
			},
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		}).then((result) => ({ result, seen }));
	}

	test("a protocol declaring debug symbols is built with them", async () => {
		const { result, seen } = await withMode(true);

		expect(isRefusal(result)).toBe(false);
		expect(seen).toEqual([true]);
	});

	test("one declaring them off is built without them", async () => {
		expect((await withMode(false)).seen).toEqual([false]);
	});

	test("one declaring nothing is built plainly", async () => {
		expect((await withMode()).seen).toEqual([false]);
	});

	// No setting governs this and none exists: the only thing that decides is the document.
	test("nothing in the request or the wallet can change it", async () => {
		const declared = await withMode(true);
		const plain = await withMode();

		expect(declared.seen).not.toEqual(plain.seen);
	});
});

/**
 * An action that creates an asset, in the shape the corpus writes one.
 *
 * The declaration and the hook are lifted from `lending_v3`'s `CreateFactory`, which mints
 * an asset from a wallet output and records it in the deployment it is creating. What is
 * added is a place a later line reads it from: an OP_RETURN carrying the asset id, which is
 * how the same protocol publishes what it created. Read end to end, this is the whole claim
 * — the wallet commits to one of its own outputs, derives the asset that output produces,
 * and the document's own later line resolves it by name.
 */
function issuingManifest() {
	const document = structuredClone(p2pkManifest) as unknown as Record<string, unknown>;
	const actions = document.actions as Record<string, Record<string, unknown>>;
	const pay = actions.Pay!;
	const inputs = pay.inputs as Record<string, unknown>[];
	const outputs = pay.outputs as Record<string, unknown>[];

	inputs[0]!.issuance = { asset_amount_sat: 2, inflation_amount_sat: 0, kind: "new" };
	inputs[0]!.on_resolved = { set: { "instance.MINTED_ASSET": "asset" } };
	outputs.push({
		data: { parts: [{ type: "bytes", value: "instance.MINTED_ASSET" }] },
		description: "The asset this action created, published for whoever indexes it.",
		destination: { type: "op_return" },
		id: "minted_marker",
	});

	return document;
}

const TWO_UTXOS = [
	{ amount: "600000", spendable: true, txid: "d".repeat(64), txOut: "00", vout: 7 },
	{ amount: "1000000", spendable: true, txid: "c".repeat(64), txOut: "00", vout: 0 },
];

describe("an input that creates an asset", () => {
	async function issuingReview() {
		return reviewManifestAction(request({ manifest: issuingManifest() }), {
			...deps,
			fundingUtxos: TWO_UTXOS,
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});
	}

	test("derives the asset from the wallet output it commits to spending", async () => {
		const result = await issuingReview();

		expect(isRefusal(result)).toBe(false);

		if (isRefusal(result)) {
			return;
		}

		const issued = result.issuances[0];

		expect(result.issuances.length).toBe(1);
		expect(issued?.inputId).toBe("funding_input");
		expect(issued?.assetAmountSats).toBe(2n);
		// The asset is a statement about one output, so it has to be the derivation of the
		// output this transaction actually spends rather than of any output the wallet holds.
		expect(issued?.asset).toBe(
			deriveNewIssuance({ txid: issued?.outpoint.txid ?? "", vout: issued?.outpoint.vout ?? 0 })
				?.asset ?? "",
		);
	});

	// The output the asset is derived from has to be spent, exactly once. Left out, the id is
	// for an asset that never exists; taken twice, there is no transaction at all.
	test("spends that output once, and the selection does not offer it again", async () => {
		const result = await issuingReview();

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		const issued = result.issuances[0]!;
		const spending = result.selected.filter(
			(utxo) => utxo.txid === issued.outpoint.txid && utxo.vout === issued.outpoint.vout,
		);

		expect(spending.length).toBe(1);
		expect(result.selected[0]?.txid).toBe(issued.outpoint.txid);
	});

	test("makes the asset readable by name in a line written after it", async () => {
		const result = await issuingReview();

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		const marker = result.outputs.find((output) => output.id === "minted_marker");

		// The OP_RETURN carries the asset as bytes, so the id the hook read is in the script
		// the transaction pays to — not merely in a value the review kept to itself.
		expect(marker?.scriptPubKeyHex).toContain(result.issuances[0]!.asset);
		// And it is the script the document asked for. Paid to the wallet instead, this output
		// would carry nothing, pay nothing, and look exactly like a correct one from outside.
		expect(marker?.scriptPubKeyHex.startsWith("6a")).toBe(true);
		expect(marker?.scriptPubKeyHex).not.toBe(WALLET_SCRIPT);
	});

	test("refuses when the wallet has no output to derive an asset from", async () => {
		const result = await reviewManifestAction(request({ manifest: issuingManifest() }), {
			...deps,
			fundingUtxos: [],
			readTxOut: readTxOut(UNSPENT_ELSEWHERE),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("shortfall");
		}
	});
});

describe("a covenant told which branch to run", () => {
	/**
	 * The p2pk spend, with a branch selector grafted onto its covenant input.
	 *
	 * The declaration is the shape every published protocol writes: a SimplicityHL type and a
	 * literal, both stated by the document. p2pk's own contract has one branch, so the value
	 * here proves the path rather than the protocol.
	 */
	function branchingManifest() {
		const document = structuredClone(p2pkManifest) as unknown as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.Receive!.inputs as Record<string, unknown>[];
		const witnesses = inputs[0]!.witnesses as Record<string, unknown>;

		witnesses.PATH = {
			simplicity_type: "Either<u32, u32>",
			type: "simplicityhl",
			value: "Left(instance.CHOSEN)",
		};

		return document;
	}

	test("carries the stated value on the input it belongs to, resolved", async () => {
		const result = await reviewManifestAction(
			{
				...spendRequest(oneCovenantUtxo),
				instance: { instance: { fields: { CHOSEN: "7" } } },
				manifest: branchingManifest(),
			},
			{ ...deps, readTxOut: readTxOut(DERIVED_SCRIPT) },
		);

		expect(isRefusal(result)).toBe(false);

		if (isRefusal(result)) {
			return;
		}

		const spent = result.covenantInputs.find((covenant) => covenant.id === "p2pk_in");

		// The type travels unparsed and the literal has its one name filled in. Nothing else in
		// the text is touched: `Left` is the language's word, not a value to look up.
		expect(spent?.witnessValues).toEqual([
			{ name: "PATH", simplicityType: "Either<u32, u32>", value: "Left(7)" },
		]);
		// The signature the covenant needs is still asked for beside it, not replaced by it.
		expect(spent?.signatureWitness).toBe("SIGNATURE");
	});

	test("refuses when the value names something the deployment does not carry", async () => {
		const result = await reviewManifestAction(
			{ ...spendRequest(oneCovenantUtxo), manifest: branchingManifest() },
			{ ...deps, readTxOut: readTxOut(DERIVED_SCRIPT) },
		);

		expect(isRefusal(result)).toBe(true);
	});
});
