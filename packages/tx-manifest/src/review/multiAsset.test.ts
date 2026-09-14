import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import multiassetManifest from "../__fixtures__/multiasset.manifest.json";
import { deriveNewIssuance } from "../chain/issuance";
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
