import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import lendingManifest from "../__fixtures__/current/lending_v3.manifest.json";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { isRefusal, reviewManifestAction } from "./index";

/**
 * A live protocol's action reviewed end to end, where the covenant it spends is parameterised
 * by values rather than by names.
 *
 * `covenants/valueWiredCovenant.test.ts` proves the covenant seam encodes those values from the
 * type their contract declares. This proves the seam is *reached* — that a wallet calling
 * `reviewManifestAction`, which is the only thing standing between a request and a signature,
 * gets an action reviewed rather than refused. A capability the review path never calls is not
 * delivered, however well it is tested on its own.
 *
 * The contracts are compiled by a substitute, as everywhere in this package. What the real
 * compiler makes of the same arguments is `adapters/smplx/valueWiredCovenant.test.ts`.
 */

const here = dirname(fileURLToPath(import.meta.url));

function contract(name: string): string {
	return readFileSync(join(here, "../__fixtures__/contracts", name), "utf8");
}

const SOURCES = {
	"./asset_auth.simf": contract("asset_auth.simf"),
	"./asset_auth_vault.simf": contract("asset_auth_vault.simf"),
	"./issuance_factory.simf": contract("issuance_factory.simf"),
	"./lending.simf": contract("lending.simf"),
	"./script_auth.simf": contract("script_auth.simf"),
};

/**
 * The compiler's answer for the contracts this reaches, keyed by their source text.
 *
 * By text rather than by path because that is what the seam is handed: a wallet is asked what a
 * contract declares, and the contract is the source it was given, not a name it might be filed
 * under. Pinned here so this file needs no compiler; the adapter's test asserts the compiler
 * still says it.
 */
const DECLARED: Record<string, Record<string, string>> = {
	[SOURCES["./asset_auth.simf"]]: {
		ASSET_AMOUNT: "u64",
		ASSET_ID: "u256",
		WITH_ASSET_BURN: "bool",
	},
	[SOURCES["./asset_auth_vault.simf"]]: {
		FINALIZED_VAULT_COV_HASH: "u256",
		IS_ACTIVE: "bool",
		KEEPER_AUTH_ASSET_AMOUNT: "u64",
		KEEPER_AUTH_ASSET_ID: "u256",
		SUPPLIER_AUTH_ASSET_ID: "u256",
		VAULT_ASSET_ID: "u256",
		WITH_KEEPER_ASSET_BURN: "bool",
		WITH_SUPPLIER_ASSET_BURN: "bool",
	},
};

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const asset = (byte: string) => byte.repeat(32);
const PRINCIPAL_ASSET = asset("a1");
const BORROWER_NFT = asset("b1");
const COLLATERAL_ASSET = asset("c1");
const LENDER_NFT = asset("d1");
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;

/**
 * The covenant UTXOs this deployment's state file lists, and what the chain says each holds.
 *
 * One answer per outpoint rather than one answer for every read. Each covenant an action spends
 * is checked against what is actually at its own outpoint, so a single answer for all of them
 * only survives while one covenant per action is ever reached — which is what a leaf nothing
 * could encode was hiding.
 */
const SPENDABLE = {
	lender_nft_script_auth: { amountSats: "1", rawAssetId: LENDER_NFT, txid: "e".repeat(64) },
	lending_collateral: { amountSats: "100000", rawAssetId: COLLATERAL_ASSET, txid: "d".repeat(64) },
	lending_collateral_active: {
		amountSats: "100000",
		rawAssetId: COLLATERAL_ASSET,
		txid: "c".repeat(64),
	},
	principal_asset_auth: { amountSats: "50000", rawAssetId: PRINCIPAL_ASSET, txid: "b".repeat(64) },
};

const HELD = new Map(
	Object.values(SPENDABLE).map(({ amountSats, rawAssetId, txid }) => [
		txid,
		{ amountSats, rawAssetId },
	]),
);

/** This deployment's fields, as an activated loan records them. */
const FIELDS = {
	BORROWER_NFT_ASSET_ID: BORROWER_NFT,
	COLLATERAL_AMOUNT: "100000",
	COLLATERAL_ASSET_ID: COLLATERAL_ASSET,
	CURRENT_DEBT: "52500",
	FACTORY_ASSET_ID: asset("f1"),
	FINALIZED_LENDER_VAULT_COV_HASH: asset("11"),
	FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: asset("33"),
	ISSUING_UTXOS_COUNT: "2",
	LENDER_NFT_ASSET_ID: LENDER_NFT,
	LENDER_VAULT_COV_HASH: asset("22"),
	LENDING_COV_SCRIPT_HASH: asset("66"),
	LOAN_EXPIRATION_TIME: "1900000000",
	PRINCIPAL_AMOUNT: "50000",
	PRINCIPAL_ASSET_ID: PRINCIPAL_ASSET,
	PRINCIPAL_INTEREST_RATE: "500",
	PRINCIPAL_OUTPUT_SCRIPT_HASH: asset("55"),
	PROTOCOL_FEE_KEEPER_ASSET_ID: asset("e1"),
	PROTOCOL_FEE_VAULT_COV_HASH: asset("44"),
	REISSUANCE_FLAGS: "0",
	ZERO_HASH: "00".repeat(32),
};

function request(action: string): ParsedLiquidProcessCtParams {
	return {
		action,
		broadcast: false,
		contractSources: SOURCES,
		instance: { instance: { class: "lending_contract", fields: FIELDS } },
		manifest: lendingManifest as unknown as Record<string, unknown>,
		params: {},
		state: {
			utxos: Object.entries(SPENDABLE).map(([utxoType, { txid }]) => ({
				txid,
				utxo_type: utxoType,
				vout: 0,
			})),
		},
	} as unknown as ParsedLiquidProcessCtParams;
}

/** Reviews one action, with the contract-declaration seam filled or deliberately left empty. */
function review(
	action: string,
	{ declarations, readChainTip }: { declarations: boolean; readChainTip?: () => Promise<number> },
) {
	const compiled: { argumentsJson: string; extraLeavesJson: string; source: string }[] = [];
	const funding = [
		{ amount: "100000000", spendable: true, txid: "1".repeat(64), txOut: "00", vout: 0 },
	];
	const single = [{ amount: "1", spendable: true, txid: "9".repeat(64), txOut: "00", vout: 1 }];

	return {
		compiled,
		reviewed: reviewManifestAction(request(action), {
			accountLabel: "liquid account 0",
			compile: (input) => {
				compiled.push({
					argumentsJson: input.argumentsJson,
					extraLeavesJson: input.extraLeavesJson,
					source: input.source,
				});

				return { address: "ex1p_derived", scriptPubKeyHex: DERIVED_SCRIPT };
			},
			compilerVersion: "0.6.0",
			...(declarations ? { contractParamTypes: (source: string) => DECLARED[source] ?? {} } : {}),
			fundingUtxos: funding,
			holdingsOf: (wanted: string) =>
				wanted === BORROWER_NFT || wanted === LENDER_NFT ? single : funding,
			network: "liquid",
			policyAsset: POLICY_ASSET,
			...(readChainTip ? { readChainTip } : {}),
			readFeeRate: async () => 1000,
			readTxOut: async (outpoint: { txid: string }) => ({
				...(HELD.get(outpoint.txid) ?? { amountSats: "50000", rawAssetId: PRINCIPAL_ASSET }),
				scriptPubKeyHex: DERIVED_SCRIPT,
				txOutHex: "00",
			}),
			scriptPubKeyOf: () => DERIVED_SCRIPT,
			walletScriptPubKeyHex: `0014${"11".repeat(20)}`,
		}),
	};
}

/** Whatever compile carried this argument, whichever covenant it belonged to. */
function argumentFor(calls: { argumentsJson: string }[], name: string): unknown {
	for (const call of calls) {
		const parsed = JSON.parse(call.argumentsJson) as Record<string, unknown>;

		if (name in parsed) {
			return parsed[name];
		}
	}

	return undefined;
}

describe("claiming the principal, through the review a wallet actually runs", () => {
	test("is refused when nothing says what its contract declares", async () => {
		const { reviewed } = review("ClaimPrincipal", { declarations: false });
		const result = await reviewed;

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("ASSET_AMOUNT");
	});

	test("and is reviewed once the contract's own declarations reach it", async () => {
		const { reviewed } = review("ClaimPrincipal", { declarations: true });

		expect(isRefusal(await reviewed)).toBe(false);
	});

	/**
	 * The two values that had no type. A count of one is written as decimal at the width the
	 * contract declared, and a flag as the word the compiler reads — neither inferred from how
	 * it looks.
	 */
	test("with the count and the flag typed by the contract rather than by their shape", async () => {
		const { compiled, reviewed } = review("ClaimPrincipal", { declarations: true });

		await reviewed;

		expect(argumentFor(compiled, "ASSET_AMOUNT")).toEqual({ type: "u64", value: "1" });
		expect(argumentFor(compiled, "WITH_ASSET_BURN")).toEqual({ type: "bool", value: "false" });
	});

	test("and the asset id beside them still turned round the way a covenant reads one", async () => {
		const { compiled, reviewed } = review("ClaimPrincipal", { declarations: true });

		await reviewed;

		const committed = (BORROWER_NFT.match(/../g) ?? []).toReversed().join("");

		expect(argumentFor(compiled, "ASSET_ID")).toEqual({ type: "u256", value: `0x${committed}` });
	});
});

/**
 * The leaf that used to stop all of this, now built.
 *
 * `lending_collateral` and `lending_collateral_active` write their extra taproot leaves as
 * `{"type": "tapdata", "payload": [ … ]}`. This runtime read an extra leaf as a hex literal, a
 * typed value or a state variable and never as a payload list, so the leaf carried no `value`
 * and every action reaching one of those covenants was refused before a single contract was
 * compiled. The two assertions below were written the other way round, against that refusal.
 *
 * The bytes are not this runtime's opinion of what a leaf should hold. The document writes a
 * flag and a debt; the contract behind these covenants rebuilds both from `jet::tapdata_init()`
 * and a thirty-two-byte add; the protocol's own Rust builder fills a `[0u8; 32]` slot the same
 * way, `slot[31]` for the flag and `slot[24..32]` for the debt big-endian.
 */
describe("the collateral covenant a lending offer lives in", () => {
	test("is built now, with its flag and its debt as the leaves the contract hashes", async () => {
		const { compiled, reviewed } = review("RepayLoan", { declarations: true });

		await reviewed;

		expect(JSON.parse(compiled[0]?.extraLeavesJson ?? "[]")).toEqual([
			`${"00".repeat(31)}01`,
			`${"00".repeat(30)}cd14`,
		]);
	});

	/** The two finalised vaults are reached only by `RepayLoan`, and only past that leaf. */
	test("and repaying now reaches the two finalised vaults it stopped in front of", async () => {
		const { compiled, reviewed } = review("RepayLoan", { declarations: true });

		await reviewed;

		expect(compiled).toHaveLength(3);
		expect(
			compiled.filter((call) => call.source === SOURCES["./asset_auth_vault.simf"]),
		).toHaveLength(2);
	});

	test("accepting an offer is reviewed end to end", async () => {
		expect(isRefusal(await review("AcceptOffer", { declarations: true }).reviewed)).toBe(false);
	});

	test("and so is cancelling one", async () => {
		expect(isRefusal(await review("CancelOffer", { declarations: true }).reviewed)).toBe(false);
	});

	/**
	 * The order the contract behind this covenant reads, now the one the wallet builds.
	 *
	 * Repaying is the action whose document puts an input the wallet supplies at index zero and
	 * the covenant it spends at index one. The wallet's own habit — every covenant first, then
	 * whatever it chose — cannot produce that, and it used to refuse the action for it. The
	 * contract is not being generous here: it reads input zero for the token that authorises the
	 * repayment and asserts its own index is one, so the habit builds a transaction it rejects.
	 */
	test("and repaying, whose document puts one of the wallet's own inputs first", async () => {
		const result = await review("RepayLoan", { declarations: true }).reviewed;

		expect(isRefusal(result) ? result.reason : "").toBe("");
		expect(isRefusal(result)).toBe(false);
	});

	test("with the wallet's own input built ahead of the covenant, as the document states", async () => {
		const result = await review("RepayLoan", { declarations: true }).reviewed;

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		expect(result.inputOrder.map((planned) => planned.source)).toEqual([
			"wallet",
			"covenant",
			"wallet",
			"wallet",
		]);
		expect(result.inputOrder[1]).toMatchObject({ covenant: { id: "active_offer_in" } });
		// The borrower's NFT: the one output the wallet holds in that asset, at index zero.
		expect(result.inputOrder[0]).toMatchObject({ utxo: { txid: "9".repeat(64) } });
	});
});

/**
 * What a live protocol's actions now return to the person who performed them.
 *
 * These four are the ones that review end to end, so they are the only ones that can answer
 * this from the review a wallet actually runs rather than from the resolver agreeing with
 * itself. Every one of them declares change and says nothing about it, which on this network
 * used to mean hidden — and a contract action can be funded only by outputs that hide nothing,
 * so each of these transactions used to hand back money the next action could not reach.
 *
 * They hide nothing at all now. Two of them return change in the protocol's own asset as well
 * as the network's, and both come back spendable, because a token's change starves the next
 * action exactly as the network asset's does.
 */
describe("what these actions return to the person who performed them", () => {
	const PUBLISHED =
		"nothing says otherwise and this network hides an output by default, and this " +
		"wallet publishes it anyway so your next action can spend it";

	async function reviewed(action: string) {
		const result = await review(action, { declarations: true }).reviewed;

		if (isRefusal(result)) {
			throw new Error(`${action}: ${result.reason}`);
		}

		return result;
	}

	for (const action of ["AcceptOffer", "CancelOffer", "ClaimPrincipal", "RepayLoan"]) {
		test(`${action} hides nothing, and says the change is published`, async () => {
			const result = await reviewed(action);

			expect(result.changeBlinded).toBe(false);
			expect(result.outputs.filter((output) => output.blinded)).toEqual([]);
			expect(result.confirmation.hiddenAmounts).toEqual([]);
			// The network asset's change is appended by the signing module, so it is named rather
			// than given a document's id, and it is last.
			expect(result.confirmation.publishedAmounts.at(-1)).toMatchObject({
				id: { value: "change" },
				reason: { value: PUBLISHED },
			});
		});
	}

	// The deviation is about a contract action's own change, not about the network's asset. A
	// loan is repaid and accepted in a token, and the change in that token is built by this
	// wallet at the position the document declares — hidden, it would starve the next action in
	// exactly the way the network asset's change would.
	for (const action of ["AcceptOffer", "RepayLoan"]) {
		test(`${action} publishes its change in the protocol's own asset too`, async () => {
			const result = await reviewed(action);

			expect(result.outputs).toContainEqual(
				expect.objectContaining({ blinded: false, id: "principal_change", overrode: "chain" }),
			);
			expect(result.confirmation.publishedAmounts.map((row) => row.id.value)).toEqual([
				"principal_change",
				"change",
			]);
		});
	}
});

/**
 * A covenant branch guarded by a lock height.
 *
 * `check_lock_height` is read from the transaction's own locktime, and no document in the
 * corpus states one — the height a spend becomes valid at is a fact about the chain rather
 * than about the protocol. So the wallet answers with where the chain is, and reports it, or
 * the branch is unsatisfiable and fails at execution for a reason nothing here would explain.
 */
describe("the height a spend declares", () => {
	// Exercised through an action this vendored document actually declares. The deployed
	// document's liquidation is the branch that needs a height, and it is one of the two
	// actions its own protocol's authors never published — so what is checked here is the
	// rule rather than that protocol: an action spending a covenant reports the chain's height.
	test("is the chain's own, for an action that spends a covenant", async () => {
		const result = await review("CancelOffer", {
			declarations: true,
			readChainTip: async () => 2_580_990,
		}).reviewed;

		if (isRefusal(result)) throw new Error(`refused: ${result.reason}`);

		expect(result.locktimeHeight).toBe(2_580_990);
	});

	test("is absent when no reader was supplied, rather than guessed", async () => {
		const result = await review("CancelOffer", { declarations: true }).reviewed;

		expect(!isRefusal(result) && "locktimeHeight" in result).toBe(false);
	});

	test("is absent when the reader fails, because one unread height is not a refusal", async () => {
		const result = await review("CancelOffer", {
			declarations: true,
			readChainTip: async () => {
				throw new Error("no answer");
			},
		}).reviewed;

		expect(!isRefusal(result) && "locktimeHeight" in result).toBe(false);
	});
});
