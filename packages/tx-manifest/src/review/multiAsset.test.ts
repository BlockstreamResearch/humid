import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import multiassetManifest from "../__fixtures__/multiasset.manifest.json";
import { deriveNewIssuance } from "../chain/issuance";
import { estimateFeeSats } from "../fee";
import { isRefusal, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import type { SelectableUtxo } from "./coinSelection";

// The whole of what this file exercises is that an action moving more than one asset is read,
// funded and planned per asset — and refused, per asset, when it cannot be. The fixture is a
// two-asset protocol written for exactly that; the compiler and the chain are fakes, because
// what is under test is the arithmetic and the refusals rather than either of them.

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const MANIFEST = multiassetManifest as unknown as Record<string, unknown>;
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const MONEY_TXID = "c".repeat(64);
const TOKEN_TXID = "d".repeat(64);

function utxo(amount: string, txid: string, overrides: Partial<SelectableUtxo> = {}) {
	return { amount, spendable: true, txOut: "00", txid, vout: 0, ...overrides };
}

const deps = {
	accountLabel: "liquid:testnet account 0",
	compile: () => ({ address: "tex1p_derived", scriptPubKeyHex: DERIVED_SCRIPT }),
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate: async () => 1000,
	readTxOut: async () => ({ scriptPubKeyHex: DERIVED_SCRIPT }),
	scriptPubKeyOf: () => DERIVED_SCRIPT,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

function request(overrides: Partial<ParsedLiquidProcessCtParams> = {}) {
	return {
		action: "PayToken",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: MANIFEST,
		params: { amount_sat: 1000, fee_sat: 700, pubkey: PUBKEY, token: TOKEN },
		...overrides,
	} satisfies ParsedLiquidProcessCtParams;
}

function pay(
	overrides: {
		holdings?: Record<string, SelectableUtxo[]>;
		money?: SelectableUtxo[];
		params?: Record<string, unknown>;
	} = {},
) {
	const money = overrides.money ?? [utxo("1000000", MONEY_TXID)];
	const holdings = overrides.holdings ?? { [TOKEN]: [utxo("4000", TOKEN_TXID)] };

	return reviewManifestAction(
		request(overrides.params === undefined ? {} : { params: overrides.params }),
		{ ...deps, fundingUtxos: money, holdingsOf: (asset) => holdings[asset] ?? [] },
	);
}

describe("an action that moves two assets", () => {
	test("funds each asset out of what the wallet holds in that one", async () => {
		const result = await pay();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			// The token's output first, because the action declares a token input and no money
			// one — so the token is the asset the wallet was asked for, and the money follows it
			// as the asset the fee is charged in. Deterministic either way: the same request
			// selects the same outputs in the same order twice.
			expect(result.selected.map((chosen) => chosen.txid)).toEqual([TOKEN_TXID, MONEY_TXID]);
		}
	});

	// The one rule the single-total assumption broke. Three units of a one-of-a-kind token and
	// three thousand base units of money do not make six of anything.
	test("never adds one asset's amount to another's", async () => {
		const result = await pay({ holdings: { [TOKEN]: [utxo("900", TOKEN_TXID)] } });

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			// Named by the asset that is short and by what it is short of, because a person told
			// "you do not have enough" by a wallet holding plenty of money is being told
			// something true about an asset they were not thinking about.
			expect(result.reason).toContain(TOKEN);
			expect(result.reason).toContain("1000");
			expect(result.reason).toContain("900");
		}
	});

	// Only the network's own asset has a fee taken out of it, so only its surplus is left to
	// the signing module. Every other asset's change is an exact figure with an output to land
	// in, built in the position the document declares it.
	test("plans an exact change output for the asset that is not the network's own", async () => {
		const result = await pay();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.outputs).toEqual([
				{
					asset: TOKEN,
					blinded: false,
					decidedBy: "output",
					id: "token_out",
					sats: 1000n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
				{
					asset: POLICY_ASSET,
					blinded: false,
					decidedBy: "unblindable",
					id: "p2pk_out",
					sats: 700n,
					scriptPubKeyHex: DERIVED_SCRIPT,
				},
				{
					asset: TOKEN,
					blinded: false,
					decidedBy: "spendable-change",
					id: "token_change",
					overrode: "chain",
					sats: 3000n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
			]);
		}
	});

	// The network's own change stays the builder's, because the fee comes out of it and its
	// amount is not known until the signed transaction has been weighed.
	test("and leaves the network asset's change to the builder", async () => {
		const result = await pay();

		expect(isRefusal(result) ? [] : result.outputs.map((output) => output.id)).not.toContain(
			"change_out",
		);
	});

	// The same rule at the surface. What a person is shown for an action moving two assets is
	// two lines, because a single figure could only be written by adding the two together —
	// and a token and an amount of money do not add. The token line here is zero: the wallet
	// pays its own token to itself and takes the surplus back, so what this action costs the
	// person is money, and saying so takes two sentences rather than one.
	test("shows one line per asset on the confirmation, and never one line for both", async () => {
		const result = await pay();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const rows = result.confirmation.netEffect.map((row) => [row.asset.value, row.sats.value]);

			// The network's own asset first, because the ledger seeds it before it reads a
			// single output: every transaction pays a fee and the fee is charged in that asset.
			// The token follows as the first asset the document itself names.
			expect(rows).toEqual([
				[POLICY_ASSET, -700n - result.estimatedFeeSats],
				[TOKEN, 0n],
			]);
			// Two assets, two rows, and each row keyed by the asset it is about. A surface handed
			// one figure could not have written either of these sentences.
			expect(new Set(rows.map(([asset]) => asset)).size).toBe(2);
		}
	});

	// An asset with more coming in than going out and nowhere declared to put the difference
	// is an action that would destroy that amount.
	test("refuses a surplus in an asset with no declared change output", async () => {
		const withoutChange = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = withoutChange.actions as Record<string, Record<string, unknown>>;
		const outputs = actions.PayToken?.outputs as Record<string, unknown>[];

		actions.PayToken!.outputs = outputs.filter((output) => output.id !== "token_change");

		const result = await reviewManifestAction(
			{ ...request(), manifest: withoutChange },
			{
				...deps,
				fundingUtxos: [utxo("1000000", MONEY_TXID)],
				holdingsOf: () => [utxo("4000", TOKEN_TXID)],
			},
		);

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("destroy");
	});

	// A wallet supplying no reader holds nothing in any other asset, which is a shortfall
	// naming the asset rather than a silent refusal or an action funded out of money.
	test("holding nothing in an asset is a shortfall named by that asset", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			fundingUtxos: [utxo("1000000", MONEY_TXID)],
		});

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain(TOKEN);
	});
});

describe("which of the wallet's outputs may be spent", () => {
	// The same output described twice is one output. Spending it twice is not a transaction.
	test("selects an outpoint at most once, however many objects describe it", async () => {
		// Three descriptions of two outputs, all of equal size and none of them covering the
		// amount alone. A selector that did not notice the repeat would take the first twice
		// and stop, having covered the amount by spending one output two times over.
		const result = await pay({
			money: [utxo("900", MONEY_TXID), { ...utxo("900", MONEY_TXID) }, utxo("900", "e".repeat(64))],
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const keys = result.selected.map((chosen) => `${chosen.txid}:${chosen.vout}`);

			expect(keys).toEqual([`${TOKEN_TXID}:0`, `${MONEY_TXID}:0`, `${"e".repeat(64)}:0`]);
		}
	});

	/**
	 * Identity spans the transaction, not one list.
	 *
	 * A wallet answers "what do I hold in this asset" from one snapshot, and nothing stops it
	 * offering the same physical output under two assets — a mis-labelled holding, a cache
	 * keyed by something other than the asset. Pools checked only against themselves would
	 * each be satisfied, and the transaction would spend that output twice while counting its
	 * value twice.
	 */
	test("never takes one outpoint for two assets, however it was offered", async () => {
		const shared = utxo("1000000", MONEY_TXID);
		const result = await pay({
			holdings: { [TOKEN]: [{ ...shared }, utxo("4000", TOKEN_TXID)] },
			money: [shared],
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const keys = result.selected.map((chosen) => `${chosen.txid}:${chosen.vout}`);

			expect(new Set(keys).size).toBe(keys.length);
			expect(keys).toEqual([`${TOKEN_TXID}:0`, `${MONEY_TXID}:0`]);
		}
	});

	// A txid is thirty-two bytes, and the same bytes written in two cases are the same output.
	// Identity spelled without saying so would agree until it met a wallet that upper-cases.
	test("and treats a transaction id in either case as the same output", async () => {
		const result = await pay({
			money: [
				utxo("900", MONEY_TXID),
				utxo("900", MONEY_TXID.toUpperCase()),
				utxo("900", "e".repeat(64)),
			],
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const keys = result.selected.map((chosen) => `${chosen.txid.toLowerCase()}:${chosen.vout}`);

			expect(new Set(keys).size).toBe(keys.length);
		}
	});

	/**
	 * A confidential wallet output cannot fund a contract action, and this path does not
	 * pretend otherwise.
	 *
	 * Unblinding one needs the secrets that go with it, and nothing here or in the module that
	 * signs is ever handed one. So a balance that covers the amount only with them is refused,
	 * and the refusal says why rather than telling a person they are short of money they can
	 * see on their own screen.
	 */
	test("refuses when only confidential outputs would cover it, and explains", async () => {
		const result = await pay({
			holdings: { [TOKEN]: [utxo("1000000", TOKEN_TXID, { confidential: true })] },
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("confidential outputs");
			expect(result.reason).toContain("cannot spend");
		}
	});
});

describe("an action that creates an asset", () => {
	function mint(
		money: SelectableUtxo[] = [utxo("1000", "a".repeat(64)), utxo("1000000", MONEY_TXID)],
	) {
		return reviewManifestAction(
			request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
			{ ...deps, fundingUtxos: money },
		);
	}

	// The asset is a function of the output the issuing input spends, so that output is
	// reserved before ordinary funding — an id derived from an output the wallet had not
	// committed to spending would be an id for an asset that never comes to exist.
	test("derives the asset from an output it has reserved for the purpose", async () => {
		const result = await mint();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const [issuance] = result.issuances;
			const derived = deriveNewIssuance(issuance?.outpoint ?? { txid: "", vout: 0 });

			expect(issuance?.asset).toBe(derived?.asset ?? "");
			expect(issuance?.assetAmountSats).toBe(21n);
			expect(issuance?.inflationAmountSats).toBe(0n);
			expect(issuance?.inputId).toBe("mint_in");
		}
	});

	// An issuance is a surcharge on an input that is already counted, and the estimate has to
	// carry it: an issuance adds the amount, the inflation keys, the entropy and the blinding
	// nonce to the input it sits on, and a shape that forgot to say so would price this
	// transaction as though none of that were there.
	test("prices the input that creates the asset as an issuing one", async () => {
		const result = await mint();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const shape = {
				covenantInputs: 0,
				outputs: result.outputs.length,
				walletInputs: result.selected.length,
			};

			expect(result.estimatedFeeSats).toBe(
				estimateFeeSats({ ...shape, issuingInputs: 1 }, result.feeRateSatsPerKvb),
			);
			// And the figure it would have been without the surcharge, which is what a silently
			// omitted `issuingInputs` produces: lower, so the transaction would come up short.
			expect(result.estimatedFeeSats).toBeGreaterThan(
				estimateFeeSats({ ...shape, issuingInputs: 0 }, result.feeRateSatsPerKvb),
			);
		}
	});

	// The two assets a mint moves, on the screen as two lines: the asset it creates, which the
	// wallet gains all of, and the money the fee comes out of.
	test("shows the created asset and the money it cost as separate lines", async () => {
		const result = await mint();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const rows = result.confirmation.netEffect.map((row) => [row.asset.value, row.sats.value]);

			expect(rows).toContainEqual([POLICY_ASSET, -result.estimatedFeeSats]);
			expect(rows).toContainEqual([result.issuances[0]?.asset ?? "", 21n]);
		}
	});

	// An input's own hook runs the moment that input resolves, which is what makes it able to
	// say what the input turned out to hold. Inside it, `asset` is a bare word meaning this
	// input — the one it just issued — because the input writing it is the input being
	// resolved, so there is nothing to qualify it with.
	test("an input's own hook can name the asset that input just created", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const mintAction = (document.actions as Record<string, Record<string, unknown>>).Mint ?? {};
		const inputs = mintAction.inputs as Record<string, unknown>[];
		const outputs = mintAction.outputs as Record<string, unknown>[];

		(inputs[0] ?? {}).on_resolved = { set: { "params.minted": "asset" } };
		// Read back through a name the document did not carry before the hook wrote it, so an
		// assignment that was dropped resolves to nothing rather than to the same id twice.
		(outputs[0] ?? {}).asset = "params.minted";

		const result = await reviewManifestAction(
			request({ action: "Mint", manifest: document, params: { pubkey: PUBKEY, supply: 21 } }),
			{ ...deps, fundingUtxos: [utxo("1000", "a".repeat(64)), utxo("1000000", MONEY_TXID)] },
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const minted = result.outputs.find((output) => output.id === "minted_out");

			expect(minted?.asset).toBe(result.issuances[0]?.asset ?? "");
		}
	});

	// A literal is not evaluated — that is what keeps a hash from being read as arithmetic — so
	// nothing else on this path would notice a supply of a hundred digits, and a bigint carries
	// one happily to the wasm boundary, where it becomes somebody else's exception rather than
	// this wallet's refusal.
	test("refuses a supply beyond what a transaction can carry", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.Mint?.inputs as Record<string, unknown>[];

		// Written into the document as a literal rather than supplied as a parameter: a literal
		// is not evaluated — that is what keeps a hash from being read as arithmetic — so this
		// is the path nothing else on it would notice.
		((inputs[0] ?? {}).issuance as Record<string, unknown>).asset_amount_sat =
			"99999999999999999999999999";

		const result = await reviewManifestAction(
			request({ action: "Mint", manifest: document, params: { pubkey: PUBKEY, supply: 21 } }),
			{ ...deps, fundingUtxos: [utxo("1000000", MONEY_TXID)] },
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("document-fault");
			expect(result.reason).toContain("mint_in");
		}
	});

	// Smallest first in the network's own asset: an issuance needs an output's identity rather
	// than its value, so taking the smallest leaves the most behind to pay the fee with.
	test("and reserves the smallest of them, leaving the most to pay with", async () => {
		const result = await mint();

		expect(isRefusal(result) ? "" : result.issuances[0]?.outpoint.txid).toBe("a".repeat(64));
	});

	test("spends the reserved output once and once only", async () => {
		const result = await mint();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const reserved = result.issuances[0]?.outpoint;
			const spending = result.selected.filter(
				(chosen) => chosen.txid === reserved?.txid && chosen.vout === reserved.vout,
			);

			expect(spending).toHaveLength(1);
		}
	});

	// An issuing input's `asset` is what it creates rather than what the spent output held,
	// which is the only way an action that mints a token can say what its output pays in.
	test("pays the created asset out under the id the issuance derived", async () => {
		const result = await mint();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.outputs).toContainEqual({
				asset: result.issuances[0]?.asset ?? "",
				blinded: false,
				decidedBy: "output",
				id: "minted_out",
				sats: 21n,
				scriptPubKeyHex: WALLET_SCRIPT,
			});
		}
	});

	// The units are created out of nothing, so the transaction brings them rather than the
	// wallet finding them. Counted the other way, the wallet would go looking for an asset that
	// does not exist yet and refuse the action for holding none of it.
	test("does not go looking for the asset it is about to create", async () => {
		expect(isRefusal(await mint())).toBe(false);
	});

	/**
	 * Two issuing inputs need two outputs, and the outputs have to be different ones.
	 *
	 * Each derives its asset from the output its input spends. Reserving one output twice
	 * would produce two well-formed ids for two different assets that both need that one
	 * output spent to exist, and the transaction can spend it once.
	 */
	test("never reserves one outpoint for two issuances, however it was described", async () => {
		const shared = utxo("1000", "a".repeat(64));
		const result = await twoIssuances([shared, { ...shared }, utxo("1000000", MONEY_TXID)]);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			const derivedFrom = result.issuances.map(
				(issuance) => `${issuance.outpoint.txid}:${issuance.outpoint.vout}`,
			);

			expect(result.issuances).toHaveLength(2);
			expect(new Set(derivedFrom).size).toBe(2);
			// And two different assets came out, which is the fact the outpoints were keeping
			// apart in the first place.
			expect(result.issuances[0]?.asset).not.toBe(result.issuances[1]?.asset ?? "");
		}
	});

	// Equal-sized candidates keep the order the wallet listed them, so the same request mints
	// the same asset twice. A comparator answering -1 to both directions contradicts itself and
	// lets the sort return either order.
	test("takes equal-sized candidates in the order the wallet listed them", async () => {
		const first = { ...utxo("1000", "a".repeat(64)), vout: 1 };
		const second = { ...utxo("1000", "a".repeat(64)), vout: 2 };
		const result = await twoIssuances([first, second, utxo("1000000", MONEY_TXID)]);

		expect(isRefusal(result)).toBe(false);
		expect(isRefusal(result) ? [] : result.issuances.map((one) => one.outpoint.vout)).toEqual([
			1, 2,
		]);
	});

	/**
	 * Running out of usable outputs and running out of outputs are different things.
	 *
	 * Only one of them is about the person's balance, and it is the one they can check. A
	 * refusal that said "none left to use" while the wallet showed a confidential output of
	 * plenty would be telling them something true and useless.
	 */
	test("explains a confidential candidate rather than saying there is none", async () => {
		const result = await reviewManifestAction(
			request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
			{
				...deps,
				fundingUtxos: [
					utxo("500", "a".repeat(64), { confidential: true }),
					{ ...utxo("500", "a".repeat(64), { confidential: true }) },
				],
			},
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("confidential outputs");
			expect(result.reason).toContain("unblinded address");
			// Counted once, not once per description. Quoting 1000 here would tell a person
			// they hold twice what they hold, in the sentence explaining they cannot use it.
			expect(result.reason).toContain("500");
			expect(result.reason).not.toContain("1000");
		}
	});

	// The same sentence is owed after the open candidates run out, not only when there were
	// never any.
	test("and still explains it once the open candidates are exhausted", async () => {
		// One open output and one confidential. The first issuance takes the open one; the
		// second finds nothing it can use, and what it cannot use is exactly what the person
		// needs to be told about.
		const result = await twoIssuances([
			utxo("1000", "a".repeat(64)),
			utxo("900000", "b".repeat(64), { confidential: true }),
		]);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("confidential outputs");
			expect(result.reason).toContain("900000");
		}
	});
});

/** The Mint action with a second issuing input, for the cases that need two of them. */
function twoIssuances(money: SelectableUtxo[]) {
	const document = structuredClone(MANIFEST) as Record<string, unknown>;
	const actions = document.actions as Record<string, Record<string, unknown>>;
	const inputs = actions.Mint?.inputs as Record<string, unknown>[];

	inputs.push({ ...structuredClone(inputs[0]), id: "mint_two" });

	// Its units need somewhere to go, or the action leaves an asset over with nowhere declared
	// to put it — which is a refusal about the document rather than about the outpoints these
	// cases are here to exercise.
	const outputs = actions.Mint?.outputs as Record<string, unknown>[];

	outputs.splice(1, 0, {
		amount_sat: "params.supply",
		asset: "mint_two.asset",
		confidential: false,
		destination: "wallet",
		id: "minted_two_out",
	});

	return reviewManifestAction(
		{
			...request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
			manifest: document,
		},
		{ ...deps, fundingUtxos: money },
	);
}

describe("the issuances this wallet refuses outright", () => {
	async function mintDeclaring(issuance: Record<string, unknown>) {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.Mint?.inputs as Record<string, unknown>[];

		inputs[0]!.issuance = issuance;

		return reviewManifestAction(
			{
				...request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
				manifest: document,
			},
			{ ...deps, fundingUtxos: [utxo("1000000", MONEY_TXID)] },
		);
	}

	test("a reissuance, because the request carries no entropy to derive it from", async () => {
		const result = await mintDeclaring({ asset_amount_sat: 21, kind: "reissue" });

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("entropy");
	});

	test("and a reissuance token, which would have to be confidential to be spendable", async () => {
		const result = await mintDeclaring({
			asset_amount_sat: 21,
			inflation_amount_sat: 1,
			kind: "new",
		});

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("confidential");
	});
});

/**
 * Which outputs hide what they carry, and whose word decided it.
 *
 * The format's order is the output's own word, then the document's, then the chain's — and on
 * Liquid the chain's word is that an output is hidden, which makes a document's silence a
 * decision rather than an absence. Two destinations are answered before the order is consulted
 * at all, and a contract action's own change is answered after it and against it.
 */
const outputsOf = (document: Record<string, unknown>) =>
	(document.actions as Record<string, Record<string, unknown>>).PayToken?.outputs as Record<
		string,
		unknown
	>[];

describe("what each output does with the value it carries", () => {
	function documentSaying(edit: (document: Record<string, unknown>) => void) {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;

		edit(document);

		return reviewManifestAction(
			{ ...request(), manifest: document },
			{
				...deps,
				fundingUtxos: [utxo("1000000", MONEY_TXID)],
				holdingsOf: () => [utxo("4000", TOKEN_TXID)],
			},
		);
	}

	test("an output's own word comes first, over the document's", async () => {
		const result = await documentSaying((document) => {
			document.confidential_outputs = true;
			outputsOf(document)[0]!.confidential = false;
		});

		expect(isRefusal(result)).toBe(false);
		expect(isRefusal(result) ? undefined : result.outputs[0]).toMatchObject({
			blinded: false,
			decidedBy: "output",
			id: "token_out",
		});
	});

	test("the document's word comes next, when the output says nothing", async () => {
		const result = await documentSaying((document) => {
			document.confidential_outputs = false;
			delete outputsOf(document)[0]!.confidential;
		});

		expect(isRefusal(result) ? undefined : result.outputs[0]).toMatchObject({
			blinded: false,
			decidedBy: "document",
			id: "token_out",
		});
	});

	/**
	 * The step that makes silence a decision, and the reason it cannot be built here yet.
	 *
	 * On this network an output nobody spoke about is hidden, and hiding one needs the blinding
	 * key of the address it pays to. For an output paying somewhere the document names, that
	 * key belongs to whoever owns that address and this wallet has no way to obtain it — so it
	 * is refused rather than published in the open, which cannot be taken back.
	 */
	test("and silence means hidden, which a wallet output can be and a covenant's cannot", async () => {
		const result = await documentSaying((document) => {
			delete outputsOf(document)[0]!.confidential;
		});

		expect(isRefusal(result) ? undefined : result.outputs[0]).toMatchObject({
			blinded: true,
			decidedBy: "chain",
			id: "token_out",
		});
	});

	/**
	 * Answered before the precedence is consulted at all.
	 *
	 * A Simplicity program reads exact amounts and asset ids through jets that cannot
	 * introspect a commitment, so a hidden covenant output is one its own contract could never
	 * check. An OP_RETURN carries bytes rather than value and has nothing to hide.
	 */
	test("a covenant output is open whatever the document says", async () => {
		const result = await documentSaying((document) => {
			document.confidential_outputs = true;
			outputsOf(document)[1]!.confidential = true;
		});

		expect(isRefusal(result) ? undefined : result.outputs[1]).toMatchObject({
			blinded: false,
			decidedBy: "unblindable",
			id: "p2pk_out",
		});
	});

	test("and so is an OP_RETURN", async () => {
		const result = await documentSaying((document) => {
			outputsOf(document)[1] = {
				confidential: true,
				destination: { type: "op_return" },
				id: "burn_out",
			};
		});

		expect(isRefusal(result) ? undefined : result.outputs[1]).toMatchObject({
			blinded: false,
			decidedBy: "unblindable",
			id: "burn_out",
			// `6a` on its own: an output whose first opcode is OP_RETURN cannot be spent by
			// anyone, which is the whole of what a burn needs.
			scriptPubKeyHex: "6a",
		});
	});

	/**
	 * The one place this wallet answers over the format rather than under it.
	 *
	 * A contract action can be funded only by outputs that hide nothing, so change returned
	 * hidden is money the next action cannot reach and a sequence of actions starves itself
	 * after the first. The change amount is published on chain as a result; that is the price,
	 * and the word that was set aside is carried out so a person can be told which one it was.
	 */
	test("a contract action's change is published, carrying the word that was set aside", async () => {
		const result = await documentSaying((document) => {
			document.confidential_outputs = true;
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.changeBlinded).toBe(false);
			expect(result.changeOverrode).toBe("document");
			expect(result.outputs.find((output) => output.id === "token_change")).toMatchObject({
				blinded: false,
				decidedBy: "spendable-change",
				overrode: "document",
			});
		}
	});

	// It fires only where the format would have hidden. A protocol asking for open change is
	// simply agreed with, and nothing claims to have been overridden.
	test("but overrides nothing where the protocol asked for open change itself", async () => {
		const result = await documentSaying((document) => {
			outputsOf(document)[3]!.confidential = false;
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.changeBlinded).toBe(false);
			expect(result.changeOverrode).toBeUndefined();
		}
	});

	// Change that says nothing about itself gets this network's own answer, which is to hide —
	// and this wallet publishes it anyway, saying whose word that was.
	test("and says the same about change the document says nothing about", async () => {
		const result = await reviewManifestAction(
			request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
			{ ...deps, fundingUtxos: [utxo("1000000", MONEY_TXID)] },
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.changeBlinded).toBe(false);
			expect(result.changeOverrode).toBe("chain");
		}
	});
});

/**
 * What a covenant holds is the chain's word, and where the chain does not say it, nothing does.
 *
 * A covenant output on this network cannot be confidential and still work — a Simplicity
 * program reads exact amounts and asset ids through jets that cannot introspect a commitment —
 * so a read that comes back without them is either an output no contract could have spent or a
 * reader that does not report what it holds. Either way the wallet has not been told, and it
 * refuses rather than assuming.
 *
 * Reading it as zero is the alternative, and it is not the conservative one. The wallet would
 * fund every output in full out of its own money, the covenant's real balance would arrive in
 * the transaction unaccounted for, and the whole of it would fall into the change the signing
 * module appends — an unknown balance swept somewhere nobody was shown, out of a plan calling
 * itself settled.
 */
describe("a covenant that does not state what it holds", () => {
	function spendReading(
		txOut: { amountSats?: string; rawAssetId?: string },
		options: { asset?: string; named?: boolean } = {},
	) {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;

		(actions.PayToken!.inputs as Record<string, unknown>[]).push({
			...(options.named === false ? {} : { id: "vault_in" }),
			utxo_source: { utxo_type: "p2pk_output" },
		});

		// The token half of the action, removed where the case is about an action that moves
		// nothing but the network's own asset.
		if (options.asset === "policy-only") {
			actions.PayToken!.inputs = [];
			actions.PayToken!.outputs = (actions.PayToken!.outputs as Record<string, unknown>[]).filter(
				(output) => output.asset !== "params.token",
			);
			(actions.PayToken!.inputs as Record<string, unknown>[]).push({
				id: "vault_in",
				utxo_source: { utxo_type: "p2pk_output" },
			});
		}

		return reviewManifestAction(
			{
				...request(),
				manifest: document,
				state: { utxos: [{ txid: "f".repeat(64), utxo_type: "p2pk_output", vout: 0 }] },
			},
			{
				...deps,
				fundingUtxos: [utxo("1000000", MONEY_TXID)],
				holdingsOf: () => [utxo("4000", TOKEN_TXID)],
				readTxOut: async () => ({ ...txOut, scriptPubKeyHex: DERIVED_SCRIPT }),
			},
		);
	}

	// Unconditionally, and the reason says what the wallet was not told rather than naming an
	// amount nobody supplied.
	test("is refused where the action moves a second asset", async () => {
		const result = await spendReading({});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("p2pk_output");
			expect(result.reason).toContain("explicit amount and asset");
			expect(result.reason).toContain("will not assume a balance");
		}
	});

	// The case that used to be let through. Every asset here is the network's own, so the
	// arithmetic looks harmless — and it is exactly where an unknown balance would be swept
	// into change.
	test("and where the action moves nothing but the network's own asset", async () => {
		const result = await spendReading({}, { asset: "policy-only" });

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("explicit amount and asset");
	});

	// Half an answer is not an answer. An amount without an asset cannot be netted against
	// anything, because netting is only sound within one asset.
	test("and where the chain reports only one half of what it holds", async () => {
		const amountOnly = await spendReading({ amountSats: "600" });
		const assetOnly = await spendReading({ rawAssetId: POLICY_ASSET });

		expect(isRefusal(amountOnly)).toBe(true);
		expect(isRefusal(assetOnly)).toBe(true);
	});

	/**
	 * A holding with nowhere to be attributed is dropped, and dropping it is the same
	 * arithmetic mistake as reading it as zero.
	 *
	 * The ledger keys what the transaction brings by the input that brings it, so a covenant
	 * input the manifest gives no id cannot be subtracted from any asset's cost. This is the
	 * narrow guard that keeps that subtraction honest, not a check on the document at large.
	 */
	test("and where it states what it holds but the manifest gives the input no id", async () => {
		const result = await spendReading(
			{ amountSats: "600", rawAssetId: POLICY_ASSET },
			{ named: false },
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("no id");
			expect(result.reason).toContain("600");
		}
	});

	// Stated and named, it is netted against that asset's cost — within its own asset and no
	// other.
	test("but is netted against that asset's cost where it states and names it", async () => {
		const result = await spendReading({ amountSats: "600", rawAssetId: POLICY_ASSET });

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			// The covenant brings 600 of the 700 the money output costs, so the wallet finds the
			// rest and the fee — never the whole 700 again, and never any of the token.
			expect(result.selected.map((chosen) => chosen.txid)).toEqual([TOKEN_TXID, MONEY_TXID]);
		}
	});
});

/**
 * What an action requires of where its money comes from, when it requires anything.
 *
 * `from_address` resolves to whatever the request or the deployment carries and is compared
 * against the `scriptPubKeyHex` the wallet records for its own outputs — hex against hex.
 * Nothing in this package decodes an address, so these tests state scripts on both sides; a
 * deployment recording a bech32 address against a wallet recording a script would simply not
 * match, and the action would be refused rather than funded from somewhere else.
 */
describe("an action that pins an input to one address", () => {
	const BORROWER_SCRIPT = `0014${"77".repeat(20)}`;
	const OTHER_SCRIPT = `0014${"88".repeat(20)}`;

	/** The published action with `from_address` written onto the inputs the case needs. */
	function pinned(pins: Record<string, string>): Record<string, unknown> {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;

		for (const action of Object.values(actions)) {
			for (const entry of (action.inputs ?? []) as Record<string, unknown>[]) {
				const pin = pins[String(entry.id)];

				if (pin !== undefined) {
					entry.from_address = pin;
				}
			}
		}

		return document;
	}

	// The whole of what the per-input rule buys. The token input is pinned; the policy-asset
	// outputs that pay the fee are not, and no input declares them at all. Constraining every
	// asset by the one pin found — which is what a single pin did — refuses this action for
	// holding no fee money at the borrower's address, which the document never asked about.
	test("constrains only the asset that input funds, and leaves the others alone", async () => {
		const result = await reviewManifestAction(
			request({
				manifest: pinned({ token_in: "params.borrower" }),
				params: {
					amount_sat: 1000,
					borrower: BORROWER_SCRIPT,
					fee_sat: 700,
					pubkey: PUBKEY,
					token: TOKEN,
				},
			}),
			{
				...deps,
				// The wallet's money sits at a script of its own, and nothing says it should not.
				fundingUtxos: [utxo("1000000", MONEY_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
				holdingsOf: (asset) =>
					asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })] : [],
			},
		);

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.selected.map((chosen) => chosen.txid)).toContain(MONEY_TXID);
		}
	});

	// And the pin is a pin: an output in the pinned asset that is not there cannot fund it.
	test("and refuses when the pinned asset is held somewhere else", async () => {
		const result = await reviewManifestAction(
			request({
				manifest: pinned({ token_in: "params.borrower" }),
				params: {
					amount_sat: 1000,
					borrower: BORROWER_SCRIPT,
					fee_sat: 700,
					pubkey: PUBKEY,
					token: TOKEN,
				},
			}),
			{
				...deps,
				fundingUtxos: [utxo("1000000", MONEY_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
				holdingsOf: (asset) =>
					asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: OTHER_SCRIPT })] : [],
			},
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("no-funds-at-signing-address");
			// The asset it is short of *there*, which is a different sentence from being short of
			// it at all and sends a person somewhere else.
			expect(result.reason).toContain(TOKEN);
			expect(result.reason).toContain("token_in");
		}
	});

	// One selection is made per asset, so two inputs in one asset pinned to two scripts cannot
	// both be honoured — and honouring either silently is the wallet choosing which half of the
	// document to believe.
	test("refuses two inputs in one asset pinned to different scripts", async () => {
		const document = pinned({ token_in: "params.borrower" }) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.PayToken?.inputs as Record<string, unknown>[];

		inputs.push({
			asset: "params.token",
			from_address: "params.lender",
			id: "token_top_up",
			utxo_source: "wallet",
		});

		const result = await reviewManifestAction(
			request({
				manifest: document,
				params: {
					amount_sat: 1000,
					borrower: BORROWER_SCRIPT,
					fee_sat: 700,
					lender: OTHER_SCRIPT,
					pubkey: PUBKEY,
					token: TOKEN,
				},
			}),
			{
				...deps,
				fundingUtxos: [utxo("1000000", MONEY_TXID)],
				holdingsOf: (asset) =>
					asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })] : [],
			},
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("no-funds-at-signing-address");
			// Both, and the reason they cannot both be honoured. Naming only the second would be
			// the refusal a wallet that had quietly let the last pin win happens to produce.
			expect(result.reason).toContain("token_in");
			expect(result.reason).toContain("token_top_up");
			expect(result.reason).toContain("one selection");
		}
	});

	// A pin belongs to one declared input. An issuance on an input the document pins nothing
	// for is not misplaced by a pin somewhere else in the same action — and checking every
	// reserved output against every pin refuses exactly this action.
	test("leaves an issuance alone when the pin is on a different input in another asset", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const mint = actions.Mint ?? {};
		const inputs = mint.inputs as Record<string, unknown>[];
		const outputs = mint.outputs as Record<string, unknown>[];

		// A second input, in the token rather than in the money, and it alone is pinned.
		inputs.push({
			asset: "params.token",
			from_address: "params.borrower",
			id: "token_in",
			utxo_source: "wallet",
		});
		outputs.push({
			amount_sat: "params.token_amount",
			asset: "params.token",
			confidential: false,
			destination: "wallet",
			id: "token_out",
		});

		const result = await reviewManifestAction(
			request({
				action: "Mint",
				manifest: document,
				params: {
					borrower: BORROWER_SCRIPT,
					pubkey: PUBKEY,
					supply: 21,
					token: TOKEN,
					token_amount: 4000,
				},
			}),
			{
				...deps,
				// The issuing input is funded from money held elsewhere, which nothing pinned.
				fundingUtxos: [utxo("1000000", MONEY_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
				holdingsOf: (asset) =>
					asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })] : [],
			},
		);

		expect(isRefusal(result)).toBe(false);
	});

	// A pin on an input the wallet funds nothing for is a requirement about a choice this wallet
	// never makes. Passing it over is how an action gets funded from somewhere ruled out.
	test("refuses a pin on an input the wallet does not fund", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.PayToken?.inputs as Record<string, unknown>[];

		inputs.push({
			from_address: "params.borrower",
			id: "covenant_in",
			utxo_source: { utxo_type: "p2pk_output" },
		});

		const result = await reviewManifestAction(
			request({
				manifest: document,
				params: {
					amount_sat: 1000,
					borrower: BORROWER_SCRIPT,
					fee_sat: 700,
					pubkey: PUBKEY,
					token: TOKEN,
				},
				state: { utxos: [{ txid: "e".repeat(64), utxo_type: "p2pk_output", vout: 0 }] },
			}),
			{
				...deps,
				readTxOut: async () => ({
					amountSats: "10000",
					rawAssetId: POLICY_ASSET,
					scriptPubKeyHex: DERIVED_SCRIPT,
				}),
				fundingUtxos: [utxo("1000000", MONEY_TXID)],
				holdingsOf: (asset) => (asset === TOKEN ? [utxo("4000", TOKEN_TXID)] : []),
			},
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("document-fault");
			expect(result.reason).toContain("covenant_in");
		}
	});

	// The output an issuance is derived from is chosen before any pin can be resolved, because
	// the asset id depends on that output. Where the two disagree the action is refused rather
	// than moved: another output would mint a different asset than the one already computed.
	test("refuses an issuance derived from an output outside that input's own pin", async () => {
		const result = await reviewManifestAction(
			request({
				action: "Mint",
				manifest: pinned({ mint_in: "params.borrower" }),
				params: { borrower: BORROWER_SCRIPT, pubkey: PUBKEY, supply: 21 },
			}),
			{ ...deps, fundingUtxos: [utxo("1000000", MONEY_TXID, { scriptPubKeyHex: OTHER_SCRIPT })] },
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("no-funds-at-signing-address");
			expect(result.reason).toContain("mint_in");
		}
	});

	test("and accepts one derived from an output that is there", async () => {
		const result = await reviewManifestAction(
			request({
				action: "Mint",
				manifest: pinned({ mint_in: "params.borrower" }),
				params: { borrower: BORROWER_SCRIPT, pubkey: PUBKEY, supply: 21 },
			}),
			{
				...deps,
				fundingUtxos: [utxo("1000000", MONEY_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })],
			},
		);

		expect(isRefusal(result)).toBe(false);
	});
});

describe("a document that names one surplus twice", () => {
	// Both readings of a second change declaration are decisions the document did not make:
	// taking the first drops one that may hide what the other publishes, and splitting the
	// surplus invents a division nothing asked for.
	test("is refused rather than resolved in the wallet's favour", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const outputs = actions.PayToken?.outputs as Record<string, unknown>[];

		outputs.push({
			asset: "params.token",
			confidential: true,
			destination: "change",
			id: "token_change_again",
		});

		const result = await reviewManifestAction(request({ manifest: document }), {
			...deps,
			fundingUtxos: [utxo("1000000", MONEY_TXID)],
			holdingsOf: (asset) => (asset === TOKEN ? [utxo("4000", TOKEN_TXID)] : []),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("document-fault");
			expect(result.reason).toContain("token_change");
			expect(result.reason).toContain("token_change_again");
		}
	});
});
