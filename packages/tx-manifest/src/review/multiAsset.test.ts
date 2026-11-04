import { describe, expect, test } from "bun:test";

import { deriveNewIssuance } from "../chain/issuance";
import { estimateFeeSats } from "../fee";
import { reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import type { SelectableUtxo } from "./coinSelection";
import {
	asRefusal,
	asReview,
	COVENANT_TXOUT,
	DERIVED_SCRIPT,
	dependencies,
	Fixture,
	FUNDING_TXID,
	POLICY_ASSET,
	PUBKEY,
	utxo,
	WALLET_SCRIPT,
} from "./reviewForTests";

const multiasset = Fixture.load("multiasset");
const MANIFEST = multiasset.manifest;
const TOKEN = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
const TOKEN_TXID = "d".repeat(64);

const deps = dependencies({
	readTxOut: async () => ({ scriptPubKeyHex: DERIVED_SCRIPT, txOutHex: COVENANT_TXOUT }),
});

function request(overrides: Partial<ParsedLiquidProcessCtParams> = {}) {
	return multiasset.request("PayToken", {
		params: { amount_sat: 1000, fee_sat: 700, pubkey: PUBKEY, token: TOKEN },
		...overrides,
	});
}

function pay(
	overrides: {
		holdings?: Record<string, SelectableUtxo[]>;
		money?: SelectableUtxo[];
		params?: Record<string, unknown>;
	} = {},
) {
	const money = overrides.money ?? [utxo("1000000", FUNDING_TXID)];
	const holdings = overrides.holdings ?? { [TOKEN]: [utxo("4000", TOKEN_TXID)] };

	return reviewManifestAction(
		request(overrides.params === undefined ? {} : { params: overrides.params }),
		{ ...deps, fundingUtxos: money, holdingsOf: (asset) => holdings[asset] ?? [] },
	);
}

describe("an action that moves two assets", () => {
	test("funds each asset out of what the wallet holds in that one", async () => {
		const review = asReview(await pay());

		expect(review.selected.map((chosen) => chosen.txid)).toEqual([TOKEN_TXID, FUNDING_TXID]);
	});

	test("never adds one asset's amount to another's", async () => {
		const refusal = asRefusal(await pay({ holdings: { [TOKEN]: [utxo("900", TOKEN_TXID)] } }));

		expect(refusal.reject).toBe("shortfall");
		expect(refusal.reason).toContain(TOKEN);
		expect(refusal.reason).toContain("1000");
		expect(refusal.reason).toContain("900");
	});

	test("plans an exact change output for the asset that is not the network's own", async () => {
		const review = asReview(await pay());

		expect(review.outputs).toEqual([
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
	});

	test("and leaves the network asset's change to the builder", async () => {
		const review = asReview(await pay());

		expect(review.outputs.map((output) => output.id)).not.toContain("change_out");
	});

	test("shows one line per asset on the confirmation, and never one line for both", async () => {
		const review = asReview(await pay());

		const rows = review.confirmation.netEffect.map((row) => [row.asset.value, row.sats.value]);

		expect(rows).toEqual([
			[POLICY_ASSET, -700n - review.estimatedFeeSats],
			[TOKEN, 0n],
		]);
		expect(new Set(rows.map(([asset]) => asset)).size).toBe(2);
	});

	test("refuses a surplus in an asset with no declared change output", async () => {
		const withoutChange = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = withoutChange.actions as Record<string, Record<string, unknown>>;
		const outputs = actions.PayToken?.outputs as Record<string, unknown>[];

		actions.PayToken!.outputs = outputs.filter((output) => output.id !== "token_change");

		const refusal = asRefusal(
			await reviewManifestAction(
				{ ...request(), manifest: withoutChange },
				{
					...deps,
					fundingUtxos: [utxo("1000000", FUNDING_TXID)],
					holdingsOf: () => [utxo("4000", TOKEN_TXID)],
				},
			),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("destroy");
	});

	test("holding nothing in an asset is a shortfall named by that asset", async () => {
		const refusal = asRefusal(
			await reviewManifestAction(request(), {
				...deps,
				fundingUtxos: [utxo("1000000", FUNDING_TXID)],
			}),
		);

		expect(refusal.reject).toBe("shortfall");
		expect(refusal.reason).toContain(TOKEN);
	});
});

describe("which of the wallet's outputs may be spent", () => {
	test("selects an outpoint at most once, however many objects describe the outpoint", async () => {
		const review = asReview(
			await pay({
				money: [
					utxo("900", FUNDING_TXID),
					{ ...utxo("900", FUNDING_TXID) },
					utxo("900", "e".repeat(64)),
				],
			}),
		);

		const keys = review.selected.map((chosen) => `${chosen.txid}:${chosen.vout}`);

		expect(keys).toEqual([`${TOKEN_TXID}:0`, `${FUNDING_TXID}:0`, `${"e".repeat(64)}:0`]);
	});

	test("never takes one outpoint for two assets, however it was offered", async () => {
		const shared = utxo("1000000", FUNDING_TXID);
		const review = asReview(
			await pay({
				holdings: { [TOKEN]: [{ ...shared }, utxo("4000", TOKEN_TXID)] },
				money: [shared],
			}),
		);

		const keys = review.selected.map((chosen) => `${chosen.txid}:${chosen.vout}`);

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toEqual([`${TOKEN_TXID}:0`, `${FUNDING_TXID}:0`]);
	});

	test("and treats a transaction id in either case as the same output", async () => {
		const review = asReview(
			await pay({
				money: [
					utxo("900", FUNDING_TXID),
					utxo("900", FUNDING_TXID.toUpperCase()),
					utxo("900", "e".repeat(64)),
				],
			}),
		);

		const keys = review.selected.map((chosen) => `${chosen.txid.toLowerCase()}:${chosen.vout}`);

		expect(new Set(keys).size).toBe(keys.length);
	});

	test("funds from a confidential output like any other", async () => {
		asReview(
			await pay({
				holdings: { [TOKEN]: [utxo("1000000", TOKEN_TXID, { confidential: true })] },
			}),
		);
	});
});

describe("an action that creates an asset", () => {
	function mint(
		money: SelectableUtxo[] = [utxo("1000", "a".repeat(64)), utxo("1000000", FUNDING_TXID)],
	) {
		return reviewManifestAction(
			request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
			{ ...deps, fundingUtxos: money },
		);
	}

	test("derives the asset from an output it has reserved for the purpose", async () => {
		const review = asReview(await mint());

		const [issuance] = review.issuances;
		const derived = deriveNewIssuance(issuance?.outpoint ?? { txid: "", vout: 0 });

		expect(issuance?.asset).toBe(derived?.asset ?? "");
		expect(issuance?.assetAmountSats).toBe(21n);
		expect(issuance?.inflationAmountSats).toBe(0n);
		expect(issuance?.inputId).toBe("mint_in");
	});

	test("prices the input that creates the asset as an issuing one", async () => {
		const review = asReview(await mint());

		const shape = {
			covenantInputs: 0,
			outputs: review.outputs.length,
			walletInputs: review.selected.length,
		};

		expect(review.estimatedFeeSats).toBe(
			estimateFeeSats({ ...shape, issuingInputs: 1 }, review.feeRateSatsPerKvb),
		);
		expect(review.estimatedFeeSats).toBeGreaterThan(
			estimateFeeSats({ ...shape, issuingInputs: 0 }, review.feeRateSatsPerKvb),
		);
	});

	test("shows the created asset and the money it cost as separate lines", async () => {
		const review = asReview(await mint());

		const rows = review.confirmation.netEffect.map((row) => [row.asset.value, row.sats.value]);

		expect(rows).toContainEqual([POLICY_ASSET, -review.estimatedFeeSats]);
		expect(rows).toContainEqual([review.issuances[0]?.asset ?? "", 21n]);
	});

	test("an input's own hook can name the asset that input just created", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const mintAction = (document.actions as Record<string, Record<string, unknown>>).Mint ?? {};
		const inputs = mintAction.inputs as Record<string, unknown>[];
		const outputs = mintAction.outputs as Record<string, unknown>[];

		(inputs[0] ?? {}).on_resolved = { set: { "params.minted": "asset" } };
		(outputs[0] ?? {}).asset = "params.minted";

		const review = asReview(
			await reviewManifestAction(
				request({ action: "Mint", manifest: document, params: { pubkey: PUBKEY, supply: 21 } }),
				{ ...deps, fundingUtxos: [utxo("1000", "a".repeat(64)), utxo("1000000", FUNDING_TXID)] },
			),
		);

		const minted = review.outputs.find((output) => output.id === "minted_out");

		expect(minted?.asset).toBe(review.issuances[0]?.asset ?? "");
	});

	test("refuses a supply beyond what a transaction can carry", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.Mint?.inputs as Record<string, unknown>[];

		((inputs[0] ?? {}).issuance as Record<string, unknown>).asset_amount_sat =
			"99999999999999999999999999";

		const refusal = asRefusal(
			await reviewManifestAction(
				request({ action: "Mint", manifest: document, params: { pubkey: PUBKEY, supply: 21 } }),
				{ ...deps, fundingUtxos: [utxo("1000000", FUNDING_TXID)] },
			),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("mint_in");
	});

	test("and reserves the smallest of them, leaving the most to pay with", async () => {
		const review = asReview(await mint());

		expect(review.issuances[0]?.outpoint.txid).toBe("a".repeat(64));
	});

	test("spends the reserved output once and once only", async () => {
		const review = asReview(await mint());

		const reserved = review.issuances[0]?.outpoint;
		const spending = review.selected.filter(
			(chosen) => chosen.txid === reserved?.txid && chosen.vout === reserved.vout,
		);

		expect(spending).toHaveLength(1);
	});

	test("pays the created asset out under the id the issuance derived", async () => {
		const review = asReview(await mint());

		expect(review.outputs).toContainEqual({
			asset: review.issuances[0]?.asset ?? "",
			blinded: false,
			decidedBy: "output",
			id: "minted_out",
			sats: 21n,
			scriptPubKeyHex: WALLET_SCRIPT,
		});
	});

	test("does not go looking for the asset it is about to create", async () => {
		asReview(await mint());
	});

	test("never reserves one outpoint for two issuances, however it was described", async () => {
		const shared = utxo("1000", "a".repeat(64));
		const review = asReview(
			await twoIssuances([shared, { ...shared }, utxo("1000000", FUNDING_TXID)]),
		);

		const derivedFrom = review.issuances.map(
			(issuance) => `${issuance.outpoint.txid}:${issuance.outpoint.vout}`,
		);

		expect(review.issuances).toHaveLength(2);
		expect(new Set(derivedFrom).size).toBe(2);
		expect(review.issuances[0]?.asset).not.toBe(review.issuances[1]?.asset ?? "");
	});

	test("takes equal-sized candidates in the order the wallet listed them", async () => {
		const first = { ...utxo("1000", "a".repeat(64)), vout: 1 };
		const second = { ...utxo("1000", "a".repeat(64)), vout: 2 };
		const review = asReview(await twoIssuances([first, second, utxo("1000000", FUNDING_TXID)]));

		expect(review.issuances.map((one) => one.outpoint.vout)).toEqual([1, 2]);
	});

	test("accepts a confidential candidate for an issuance, falling short only of funds", async () => {
		const refusal = asRefusal(
			await reviewManifestAction(
				request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
				{
					...deps,
					fundingUtxos: [
						utxo("500", "a".repeat(64), { confidential: true }),
						{ ...utxo("500", "a".repeat(64), { confidential: true }) },
					],
				},
			),
		);

		expect(refusal.reject).toBe("shortfall");
		expect(refusal.reason).toContain("500");
		expect(refusal.reason).not.toContain("cannot spend");
	});

	test("and takes a confidential candidate once the open ones are used", async () => {
		asReview(
			await twoIssuances([
				utxo("1000", "a".repeat(64)),
				utxo("900000", "b".repeat(64), { confidential: true }),
			]),
		);
	});
});

function twoIssuances(money: SelectableUtxo[]) {
	const document = structuredClone(MANIFEST) as Record<string, unknown>;
	const actions = document.actions as Record<string, Record<string, unknown>>;
	const inputs = actions.Mint?.inputs as Record<string, unknown>[];

	inputs.push({ ...structuredClone(inputs[0]), id: "mint_two" });

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
			{ ...deps, fundingUtxos: [utxo("1000000", FUNDING_TXID)] },
		);
	}

	test("a reissuance, because the request carries no entropy to derive it from", async () => {
		const refusal = asRefusal(await mintDeclaring({ asset_amount_sat: 21, kind: "reissue" }));

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("entropy");
	});

	test("and a reissuance token, which would have to be confidential to be spendable", async () => {
		const refusal = asRefusal(
			await mintDeclaring({
				asset_amount_sat: 21,
				inflation_amount_sat: 1,
				kind: "new",
			}),
		);

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("confidential");
	});
});

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
				fundingUtxos: [utxo("1000000", FUNDING_TXID)],
				holdingsOf: () => [utxo("4000", TOKEN_TXID)],
			},
		);
	}

	test("an output's own word comes first", async () => {
		const review = asReview(
			await documentSaying((document) => {
				outputsOf(document)[0]!.confidential = false;
			}),
		);

		expect(review.outputs[0]).toMatchObject({
			blinded: false,
			decidedBy: "output",
			id: "token_out",
		});
	});

	test("and silence means blinded, which a wallet output can be and a covenant's cannot", async () => {
		const review = asReview(
			await documentSaying((document) => {
				delete outputsOf(document)[0]!.confidential;
			}),
		);

		expect(review.outputs[0]).toMatchObject({
			blinded: true,
			decidedBy: "chain",
			id: "token_out",
		});
	});

	test("a covenant output is open whatever it says", async () => {
		const review = asReview(
			await documentSaying((document) => {
				outputsOf(document)[1]!.confidential = true;
			}),
		);

		expect(review.outputs[1]).toMatchObject({
			blinded: false,
			decidedBy: "unblindable",
			id: "p2pk_out",
		});
	});

	test("and so is an OP_RETURN", async () => {
		const review = asReview(
			await documentSaying((document) => {
				outputsOf(document)[1] = {
					confidential: true,
					destination: { type: "op_return" },
					id: "burn_out",
				};
			}),
		);

		expect(review.outputs[1]).toMatchObject({
			blinded: false,
			decidedBy: "unblindable",
			id: "burn_out",
			scriptPubKeyHex: "6a",
		});
	});

	test("a contract action's change is published, carrying the word that was set aside", async () => {
		const review = asReview(
			await documentSaying((document) => {
				outputsOf(document)[2]!.confidential = true;
				outputsOf(document)[3]!.confidential = true;
			}),
		);

		expect(review.changeBlinded).toBe(false);
		expect(review.changeOverrode).toBe("output");
		expect(review.outputs.find((output) => output.id === "token_change")).toMatchObject({
			blinded: false,
			decidedBy: "spendable-change",
			overrode: "output",
		});
	});

	test("but overrides nothing where the protocol asked for open change itself", async () => {
		const review = asReview(
			await documentSaying((document) => {
				outputsOf(document)[3]!.confidential = false;
			}),
		);

		expect(review.changeBlinded).toBe(false);
		expect(review.changeOverrode).toBeUndefined();
	});

	test("and says the same about change nothing says anything about", async () => {
		const minted = asReview(
			await reviewManifestAction(
				request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
				{ ...deps, fundingUtxos: [utxo("1000000", FUNDING_TXID)] },
			),
		);

		expect(minted.changeBlinded).toBe(false);
		expect(minted.changeOverrode).toBe("chain");
	});
});

describe("change when the wallet funds an action from a blinded output", () => {
	async function mintFundedFrom(confidential: boolean) {
		const result = asReview(
			await reviewManifestAction(
				request({ action: "Mint", params: { pubkey: PUBKEY, supply: 21 } }),
				{ ...deps, fundingUtxos: [utxo("1000000", FUNDING_TXID, { confidential })] },
			),
		);

		return {
			blindedAmounts: result.confirmation.blindedAmounts.map((row) => ({
				decidedBy: row.decidedBy.value,
				id: row.id.value,
			})),
			changeBlinded: result.changeBlinded,
			changeBlindedBy: result.changeBlindedBy,
			changeOverrode: result.changeOverrode,
			publishedAmounts: result.confirmation.publishedAmounts.map((row) => ({
				id: row.id.value,
				reason: row.reason.value,
			})),
		};
	}

	test("blinds the change, because the network refuses a blinded input with no blinded output", async () => {
		expect(await mintFundedFrom(true)).toEqual({
			blindedAmounts: [
				{
					decidedBy:
						"this action spends a blinded amount, and the network accepts that only if " +
						"something it pays out is blinded too",
					id: "change",
				},
			],
			changeBlinded: true,
			changeBlindedBy: "confidential-input",
			changeOverrode: undefined,
			publishedAmounts: [],
		});
	});

	test("and publishes it for the next action when every input is open", async () => {
		expect(await mintFundedFrom(false)).toEqual({
			blindedAmounts: [],
			changeBlinded: false,
			changeBlindedBy: undefined,
			changeOverrode: "chain",
			publishedAmounts: [
				{
					id: "change",
					reason:
						"nothing says otherwise and this network blinds an output by default, and this " +
						"wallet publishes it anyway so your next action can spend those funds",
				},
			],
		});
	});
});

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
				fundingUtxos: [utxo("1000000", FUNDING_TXID)],
				holdingsOf: () => [utxo("4000", TOKEN_TXID)],
				readTxOut: async () => ({
					...txOut,
					scriptPubKeyHex: DERIVED_SCRIPT,
					txOutHex: COVENANT_TXOUT,
				}),
			},
		);
	}

	test("is refused where the action moves a second asset", async () => {
		const refusal = asRefusal(await spendReading({}));

		expect(refusal.reject).toBe("unbuildable-utxo-type");
		expect(refusal.reason).toContain("p2pk_output");
		expect(refusal.reason).toContain("explicit amount and asset");
		expect(refusal.reason).toContain("will not assume a balance");
	});

	test("and where the action moves nothing but the network's own asset", async () => {
		const refusal = asRefusal(await spendReading({}, { asset: "policy-only" }));

		expect(refusal.reject).toBe("unbuildable-utxo-type");
		expect(refusal.reason).toContain("explicit amount and asset");
	});

	test("and where the chain reports only one half of what it holds", async () => {
		const halves = [{ amountSats: "600" }, { rawAssetId: POLICY_ASSET }];
		const refusals = await Promise.all(
			halves.map(async (half) => asRefusal(await spendReading(half))),
		);

		expect(refusals.map((refusal) => refusal.reject)).toEqual([
			"unbuildable-utxo-type",
			"unbuildable-utxo-type",
		]);
	});

	test("and where it states what it holds but the manifest gives the input no id", async () => {
		const refusal = asRefusal(
			await spendReading({ amountSats: "600", rawAssetId: POLICY_ASSET }, { named: false }),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("no id");
		expect(refusal.reason).toContain("600");
	});

	test("but is netted against that asset's cost where the input states and names the asset", async () => {
		const review = asReview(await spendReading({ amountSats: "600", rawAssetId: POLICY_ASSET }));

		expect(review.selected.map((chosen) => chosen.txid)).toEqual([TOKEN_TXID, FUNDING_TXID]);
	});
});

describe("an action that pins an input to one address", () => {
	const BORROWER_SCRIPT = `0014${"77".repeat(20)}`;
	const OTHER_SCRIPT = `0014${"88".repeat(20)}`;

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

	test("constrains only the asset that input funds, and leaves the others alone", async () => {
		const review = asReview(
			await reviewManifestAction(
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
					fundingUtxos: [utxo("1000000", FUNDING_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
					holdingsOf: (asset) =>
						asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })] : [],
				},
			),
		);

		expect(review.selected.map((chosen) => chosen.txid)).toContain(FUNDING_TXID);
	});

	test("and refuses when the pinned asset is held somewhere else", async () => {
		const refusal = asRefusal(
			await reviewManifestAction(
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
					fundingUtxos: [utxo("1000000", FUNDING_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
					holdingsOf: (asset) =>
						asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: OTHER_SCRIPT })] : [],
				},
			),
		);

		expect(refusal.reject).toBe("no-funds-at-signing-address");
		expect(refusal.reason).toContain(TOKEN);
		expect(refusal.reason).toContain("token_in");
	});

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

		const refusal = asRefusal(
			await reviewManifestAction(
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
					fundingUtxos: [utxo("1000000", FUNDING_TXID)],
					holdingsOf: (asset) =>
						asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })] : [],
				},
			),
		);

		expect(refusal.reject).toBe("no-funds-at-signing-address");
		expect(refusal.reason).toContain("token_in");
		expect(refusal.reason).toContain("token_top_up");
		expect(refusal.reason).toContain("one selection");
	});

	test("leaves an issuance alone when the pin is on a different input in another asset", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const mint = actions.Mint ?? {};
		const inputs = mint.inputs as Record<string, unknown>[];
		const outputs = mint.outputs as Record<string, unknown>[];

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

		asReview(
			await reviewManifestAction(
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
					fundingUtxos: [utxo("1000000", FUNDING_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
					holdingsOf: (asset) =>
						asset === TOKEN ? [utxo("4000", TOKEN_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })] : [],
				},
			),
		);
	});

	test("refuses a pin on an input the wallet does not fund", async () => {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const inputs = actions.PayToken?.inputs as Record<string, unknown>[];

		inputs.push({
			from_address: "params.borrower",
			id: "covenant_in",
			utxo_source: { utxo_type: "p2pk_output" },
		});

		const refusal = asRefusal(
			await reviewManifestAction(
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
						txOutHex: COVENANT_TXOUT,
					}),
					fundingUtxos: [utxo("1000000", FUNDING_TXID)],
					holdingsOf: (asset) => (asset === TOKEN ? [utxo("4000", TOKEN_TXID)] : []),
				},
			),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("covenant_in");
	});

	test("refuses an issuance derived from an output outside that input's own pin", async () => {
		const refusal = asRefusal(
			await reviewManifestAction(
				request({
					action: "Mint",
					manifest: pinned({ mint_in: "params.borrower" }),
					params: { borrower: BORROWER_SCRIPT, pubkey: PUBKEY, supply: 21 },
				}),
				{
					...deps,
					fundingUtxos: [utxo("1000000", FUNDING_TXID, { scriptPubKeyHex: OTHER_SCRIPT })],
				},
			),
		);

		expect(refusal.reject).toBe("no-funds-at-signing-address");
		expect(refusal.reason).toContain("mint_in");
	});

	test("and accepts one derived from an output that is there", async () => {
		asReview(
			await reviewManifestAction(
				request({
					action: "Mint",
					manifest: pinned({ mint_in: "params.borrower" }),
					params: { borrower: BORROWER_SCRIPT, pubkey: PUBKEY, supply: 21 },
				}),
				{
					...deps,
					fundingUtxos: [utxo("1000000", FUNDING_TXID, { scriptPubKeyHex: BORROWER_SCRIPT })],
				},
			),
		);
	});
});

describe("a document that names one surplus twice", () => {
	function twoTokenChanges(positions: { again?: number; first?: number } = {}) {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const outputs = actions.PayToken?.outputs as Record<string, unknown>[];
		const first = outputs.find((output) => output.id === "token_change");

		if (first && positions.first !== undefined) {
			first.required_index = positions.first;
		}

		outputs.push({
			asset: "params.token",
			confidential: true,
			destination: "change",
			id: "token_change_again",
			...(positions.again === undefined ? {} : { required_index: positions.again }),
		});

		return reviewManifestAction(request({ manifest: document }), {
			...deps,
			fundingUtxos: [utxo("1000000", FUNDING_TXID)],
			holdingsOf: (asset) => (asset === TOKEN ? [utxo("4000", TOKEN_TXID)] : []),
		});
	}

	test("pays that surplus once, into the one change output, and moves nothing else", async () => {
		const single = asReview(await pay());
		const twice = asReview(await twoTokenChanges());

		expect(
			twice.outputs
				.filter((output) => output.asset === TOKEN && output.scriptPubKeyHex === WALLET_SCRIPT)
				.map((output) => [output.id, output.sats]),
		).toEqual([
			["token_out", 1000n],
			["token_change", 3000n],
		]);
		expect(twice.outputs).toEqual(single.outputs);
	});

	test.each([
		["the first", { first: -2 }],
		["the second", { again: -1 }],
	])("is still refused when %s of them states a position", async (_which, positions) => {
		const refusal = asRefusal(await twoTokenChanges(positions));

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toBe(
			`PayToken declares change for ${TOKEN} twice, at token_change and token_change_again. ` +
				"One surplus cannot go to two places, and this wallet will not choose between them.",
		);
	});

	type PolicyPositions = { change_out?: number; token_change?: number };

	function policyChanges(options: { positions?: PolicyPositions; withoutTokenChange?: true } = {}) {
		const document = structuredClone(MANIFEST) as Record<string, unknown>;
		const actions = document.actions as Record<string, Record<string, unknown>>;
		const payToken = actions.PayToken as Record<string, unknown>;
		const outputs = (payToken.outputs as Record<string, unknown>[]).filter(
			(output) => !(options.withoutTokenChange && output.id === "token_change"),
		);

		for (const output of outputs) {
			const stated = options.positions?.[output.id as keyof PolicyPositions];

			if (stated !== undefined) {
				output.required_index = stated;
			}
		}

		payToken.outputs = outputs;

		return reviewManifestAction(
			request({ manifest: document, params: { ...request().params, token: POLICY_ASSET } }),
			{ ...deps, fundingUtxos: [utxo("1000000", FUNDING_TXID)], holdingsOf: () => [] },
		);
	}

	test("in the network's own asset, leaves the one change output to the builder", async () => {
		const single = asReview(await policyChanges({ withoutTokenChange: true }));
		const twice = asReview(await policyChanges());

		expect(twice.outputs.map((output) => [output.id, output.asset, output.sats])).toEqual([
			["token_out", POLICY_ASSET, 1000n],
			["p2pk_out", POLICY_ASSET, 700n],
		]);
		expect(twice.outputs).toEqual(single.outputs);
	});

	test.each([
		["the first", { token_change: -2 }],
		["the second", { change_out: -1 }],
	])(
		"in the network's own asset, is still refused when %s of them states a position",
		async (_which, positions) => {
			const refusal = asRefusal(await policyChanges({ positions }));

			expect(refusal.reject).toBe("document-fault");
			expect(refusal.reason).toBe(
				`PayToken declares change for ${POLICY_ASSET} twice, at token_change and change_out. ` +
					"One surplus cannot go to two places, and this wallet will not choose between them.",
			);
		},
	);
});
