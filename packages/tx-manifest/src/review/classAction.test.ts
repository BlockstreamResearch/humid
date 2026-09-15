import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import currentVaultlet from "../__fixtures__/current/vaultlet.manifest.json";
import mutualManifest from "../__fixtures__/mutual.manifest.json";
import debugVaultlet from "../__fixtures__/vaultlet-debug.manifest.json";
import groupedVaultlet from "../__fixtures__/vaultlet.manifest.json";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { isRefusal, reviewManifestAction } from "./index";

/**
 * An action declared inside a class, reviewed end to end — both halves of what that means.
 *
 * A class method reads the field values of one deployment and derives its covenant from them; a
 * constructor has no deployment to read, so it works one out — covenant script hashes and all —
 * and derives from what it worked out. Before either was possible, an action inside a class was
 * not found at all, and one that was found had no name in its wiring that could be resolved.
 *
 * The contracts are compiled by a substitute. This package holds no compiler by design: a wallet
 * supplies one, and what a real one makes of these arguments is the adapter's own question. What
 * is checked here is what the compiler is asked for and what the review reports having
 * established.
 */

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ASSET_STATED = `a0${"00".repeat(30)}0a`;
const ASSET_COMMITTED = `0a${"00".repeat(30)}a0`;
const RESERVE_HASH = "cc".repeat(32);
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

const DERIVED = "ex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;

/**
 * What the chain reports a spent covenant holds, beside where it pays.
 *
 * Stated rather than omitted because a covenant output on this network cannot be confidential
 * and still work — a Simplicity program reads exact amounts through jets that cannot
 * introspect a commitment — so a reader that left these out would stand in for something no
 * legitimate deployment produces, and the review refuses it rather than assuming a balance.
 */
const COVENANT_HOLDING = { amountSats: "50000", rawAssetId: POLICY_ASSET };

const SOURCES = Object.fromEntries(
	["vault", "reserve", "guard", "left", "right"].map((name) => [
		`./${name}.simf`,
		readFileSync(new URL(`../__fixtures__/contracts/${name}.simf`, import.meta.url), "utf8"),
	]),
);

/** What the vault contract declares about the two parameters the document writes as values. */
const DECLARED = { SLOT_COUNT: "u8", WITH_BURN: "bool" };

/** This deployment's field values, in the nested shape a current tool writes. */
const DEPLOYMENT = {
	instance: {
		class: "vaultlet_contract",
		fields: {
			GUARD_COV_HASH: "dd".repeat(32),
			OWNER_PUB_KEY: KEY,
			RESERVE_COV_HASH: RESERVE_HASH,
			TIMEOUT: "900000",
			VAULT_AMOUNT: "50000",
			VAULT_ASSET_ID: ASSET_STATED,
		},
	},
};

const FUNDING = [
	{ amount: "100000000", spendable: true, txOut: "00", txid: "c".repeat(64), vout: 0 },
];

function review(
	request: Partial<ParsedLiquidProcessCtParams>,
	overrides: { hashedBy?: () => string; onChain?: string } = {},
) {
	const compiled: {
		argumentsJson: string;
		extraLeavesJson: string;
		includeDebugSymbols: boolean;
		source: string;
	}[] = [];
	const hashed: { includeDebugSymbols: boolean; source: string }[] = [];

	return {
		compiled,
		hashed,
		result: reviewManifestAction(
			{
				broadcast: false,
				contractSources: SOURCES,
				params: {},
				...request,
			} as ParsedLiquidProcessCtParams,
			{
				accountLabel: "liquid:testnet account 0",
				compile: (input) => {
					compiled.push({
						argumentsJson: input.argumentsJson,
						extraLeavesJson: input.extraLeavesJson,
						includeDebugSymbols: input.includeDebugSymbols,
						source: input.source,
					});

					return { address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT };
				},
				contractParamTypes: () => DECLARED,
				fundingUtxos: FUNDING,
				network: "liquid",
				policyAsset: POLICY_ASSET,
				readFeeRate: async () => 1000,
				readTxOut: async () => ({
					...COVENANT_HOLDING,
					scriptPubKeyHex: overrides.onChain ?? DERIVED_SCRIPT,
				}),
				scriptPubKeyOf: ({ argumentsJson, includeDebugSymbols, source }) => {
					hashed.push({ includeDebugSymbols, source });

					return (
						overrides.hashedBy?.() ??
						`5120${Bun.hash(JSON.stringify([source, argumentsJson, includeDebugSymbols]))
							.toString(16)
							.padStart(64, "0")}`
					);
				},
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		),
	};
}

const withdraw = (document: unknown) => ({
	action: "Withdraw",
	instance: DEPLOYMENT,
	manifest: document as Record<string, unknown>,
	state: { utxos: [{ txid: "b".repeat(64), utxo_type: "vault", vout: 0 }] },
});

const openVault = (document: unknown) => ({
	action: "OpenVault",
	manifest: document as Record<string, unknown>,
	params: {
		OWNER_PUB_KEY: KEY,
		TIMEOUT: "900000",
		VAULT_AMOUNT: "50000",
		VAULT_ASSET_ID: ASSET_STATED,
	},
});

describe("a class method against a deployment that exists", () => {
	test("is reviewed rather than refused for an action nobody could find", async () => {
		const { result } = review(withdraw(groupedVaultlet));

		expect(isRefusal(await result)).toBe(false);
	});

	test("reports which class the method belongs to", async () => {
		const { result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? undefined : reviewed.boundTo).toBe("vaultlet_contract");
	});

	/**
	 * Every value in this covenant's wiring is a bare name, and every one of them is a field of
	 * the deployment rather than a parameter of the action — which declares none. The types come
	 * from the class's own field declarations, which is the only place they are stated.
	 */
	test("rebuilds its covenant from the deployment's own fields, at the class's declared types", async () => {
		const { compiled, result } = review(withdraw(groupedVaultlet));

		await result;

		expect(JSON.parse(compiled[0]?.argumentsJson ?? "{}")).toEqual({
			OWNER_PUB_KEY: { type: "Pubkey", value: `0x${KEY}` },
			RESERVE_COV_HASH: { type: "u256", value: `0x${RESERVE_HASH}` },
			SLOT_COUNT: { type: "u8", value: "2" },
			VAULT_ASSET_ID: { type: "u256", value: `0x${ASSET_COMMITTED}` },
			WITH_BURN: { type: "bool", value: "false" },
		});
	});

	test("checks what it rebuilt against what the chain says, and reports it verified", async () => {
		const { result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? [] : reviewed.covenants).toEqual([
			{
				address: DERIVED,
				argumentsJson: expect.any(String),
				extraLeavesJson: "[]",
				includeDebugSymbols: false,
				role: "spent",
				scriptPubKeyHex: DERIVED_SCRIPT,
				source: SOURCES["./vault.simf"],
				sourcePath: "./vault.simf",
				utxoType: "vault",
				verified: "matches-chain",
			},
		]);
	});

	/**
	 * The review carries the derivation itself rather than the fact that one happened. Anything
	 * that goes on to spend this covenant rebuilds it from exactly what was verified here;
	 * resolving the request a second time would be a second answer to the same question, and
	 * nothing downstream could tell the two apart.
	 */
	test("carries out what it compiled with, so nothing has to resolve the references again", async () => {
		const { compiled, result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? "" : reviewed.covenants[0]?.argumentsJson).toBe(
			compiled[0]?.argumentsJson ?? "",
		);
	});

	test("refuses when the funds are locked by a different contract", async () => {
		const { result } = review(withdraw(groupedVaultlet), { onChain: ELSEWHERE_SCRIPT });
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("not the contract the site");
	});

	/**
	 * A method belongs to a class and therefore to a deployment. Refused before anything is
	 * compiled, naming the part of the request that was absent rather than failing later on a
	 * name nobody could resolve.
	 */
	test("refuses without the deployment file, naming it", async () => {
		const { compiled, result } = review({ ...withdraw(groupedVaultlet), instance: undefined });
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain(
			"is a method of vaultlet_contract",
		);
		// Named by position, so a person can see which readings needed it.
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain(
			"utxo type vault / script / RESERVE_COV_HASH",
		);
		expect(compiled).toHaveLength(0);
	});

	test("resolves the output's amount from the deployment rather than from the request", async () => {
		const { result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? [] : reviewed.outputs).toEqual([
			// An output paid to this wallet is not change, so the format's own order decides it —
			// and on this network silence means hidden.
			{
				asset: POLICY_ASSET,
				blinded: true,
				decidedBy: "chain",
				id: "withdrawn",
				sats: 50_000n,
				scriptPubKeyHex: WALLET_SCRIPT,
			},
		]);
	});
});

describe("the constructor of the same class", () => {
	test("is reviewed with no deployment to read, and reports the one it creates", async () => {
		const { result } = review(openVault(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(false);

		if (isRefusal(reviewed)) {
			return;
		}

		expect(reviewed.createdInstance?.fields.OWNER_PUB_KEY).toBe(KEY);
		expect(reviewed.createdInstance?.fields.RESERVE_COV_HASH).toHaveLength(64);
		expect(reviewed.createdInstance?.rounds).toBe(3);
	});

	// A field the document works out rather than states: the format writes arithmetic and a
	// literal into the same slot, and a runtime that recorded the arithmetic as its own text
	// would compile the covenant against the string rather than the number.
	test("works out a field the document computes rather than recording its text", async () => {
		const document = structuredClone(groupedVaultlet) as Record<string, unknown>;
		const classes = document.classes as Record<string, { methods: Record<string, unknown> }>;
		const constructor = classes.vaultlet_contract?.methods.OpenVault as Record<string, unknown>;
		const created = constructor.create_instance as { fields: Record<string, unknown> };

		created.fields.VAULT_AMOUNT = "params.VAULT_AMOUNT * 2";

		const { result } = review(openVault(document));
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(false);

		if (!isRefusal(reviewed)) {
			expect(reviewed.createdInstance?.fields.VAULT_AMOUNT).toBe("100000");
		}
	});

	// The other half of the same rule, and the one that keeps it safe: a literal is left
	// exactly as written. Thirty-two zero bytes is a perfectly good expression that evaluates
	// to `0`, which is a different value at every position that compiles it.
	test("and leaves a literal alone, however much it looks like arithmetic", async () => {
		const { result } = review(openVault(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? "" : reviewed.createdInstance?.fields.VAULT_ASSET_ID).toBe(
			ASSET_STATED,
		);
	});

	/**
	 * What a person is shown for a contract with no history. Not "unverified", which is what a
	 * check that failed would be, and not "verified", which would claim a comparison nobody could
	 * make: the wallet derived the address itself from the deployment it just worked out, and that
	 * is a different fact rather than a weaker one.
	 */
	test("reports the covenant it creates as one with nothing yet to compare against", async () => {
		const { result } = review(openVault(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? [] : reviewed.covenants.map((found) => found.verified)).toEqual([
			"not-yet-on-chain",
		]);
	});

	test("never consults the chain for something that does not exist yet", async () => {
		let asked = 0;

		await reviewManifestAction(
			{
				broadcast: false,
				contractSources: SOURCES,
				...openVault(groupedVaultlet),
			} as ParsedLiquidProcessCtParams,
			{
				accountLabel: "liquid:testnet account 0",
				compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
				contractParamTypes: () => DECLARED,
				fundingUtxos: FUNDING,
				network: "liquid",
				policyAsset: POLICY_ASSET,
				readFeeRate: async () => 1000,
				readTxOut: async () => {
					asked += 1;

					return { ...COVENANT_HOLDING, scriptPubKeyHex: DERIVED_SCRIPT };
				},
				scriptPubKeyOf: () => DERIVED_SCRIPT,
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		);

		expect(asked).toBe(0);
	});

	/**
	 * The covenant it creates is built from the deployment it just worked out, not from the
	 * request — `RESERVE_COV_HASH` is a value no request could have supplied.
	 */
	test("derives the covenant it creates from the deployment it worked out", async () => {
		const { compiled, result } = review(openVault(groupedVaultlet));
		const reviewed = await result;

		if (isRefusal(reviewed)) {
			throw new Error(reviewed.reason);
		}

		const vault = compiled.findLast((call) => call.source === SOURCES["./vault.simf"]);

		expect(JSON.parse(vault?.argumentsJson ?? "{}")).toMatchObject({
			RESERVE_COV_HASH: {
				type: "u256",
				value: `0x${reviewed.createdInstance?.fields.RESERVE_COV_HASH ?? ""}`,
			},
		});
	});

	test("carries no deployment for the method that only spends what exists", async () => {
		const { result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		expect(isRefusal(reviewed) ? "refused" : reviewed.createdInstance).toBeUndefined();
	});
});

/**
 * The same protocol, published in the generation before its container was renamed. Both are in
 * the corpus and both locate real money, so a runtime that read one and refused the other would
 * be refusing against funds that are demonstrably there.
 */
describe("both generations of the same document", () => {
	test("review a class method identically", async () => {
		const grouped = review(withdraw(groupedVaultlet));
		const current = review(withdraw(currentVaultlet));
		// Everything but the spellings each recorded, which are the one thing that must differ.
		const { normalisation: _grouped, ...groupedReview } = (await grouped.result) as Record<
			string,
			unknown
		>;
		const { normalisation: _current, ...currentReview } = (await current.result) as Record<
			string,
			unknown
		>;

		expect(groupedReview).toEqual(currentReview);
		expect(grouped.compiled).toEqual(current.compiled);
	});

	test("and create the identical deployment from the constructor", async () => {
		const grouped = await review(openVault(groupedVaultlet)).result;
		const current = await review(openVault(currentVaultlet)).result;

		expect(isRefusal(grouped) ? undefined : grouped.createdInstance).toEqual(
			isRefusal(current) ? undefined : current.createdInstance,
		);
	});

	/** The value each was read as is the same; which spelling it was written in is still said. */
	test("differ only in the spellings each records having rewritten", async () => {
		const grouped = await review(withdraw(groupedVaultlet)).result;

		expect(isRefusal(grouped) ? [] : grouped.normalisation).toContainEqual({
			at: "action OpenVault",
			canonical: "is_constructor",
			found: "deploy",
		});
	});
});

describe("what a review still refuses", () => {
	/**
	 * A set of covenant hashes with no order to compile them in has no value to settle on.
	 * Refused rather than built from the last round, which would be an address nobody checked —
	 * and this one is an address the transaction would pay to.
	 */
	test("a deployment whose covenant hashes never settle", async () => {
		const { compiled, result } = review({
			action: "Knot",
			manifest: mutualManifest as unknown as Record<string, unknown>,
		});
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("never settle");
		expect(compiled).toHaveLength(0);
	});

	test("a covenant wired to a value when nothing says what the contract declares", async () => {
		const reviewed = await reviewManifestAction(
			{
				broadcast: false,
				contractSources: SOURCES,
				params: {},
				...withdraw(groupedVaultlet),
			} as ParsedLiquidProcessCtParams,
			{
				accountLabel: "liquid:testnet account 0",
				compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
				fundingUtxos: FUNDING,
				network: "liquid",
				policyAsset: POLICY_ASSET,
				readFeeRate: async () => 1000,
				readTxOut: async () => ({ ...COVENANT_HOLDING, scriptPubKeyHex: DERIVED_SCRIPT }),
				scriptPubKeyOf: () => DERIVED_SCRIPT,
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		);

		expect(isRefusal(reviewed)).toBe(true);
	});

	test("an action neither declaration shape declares", async () => {
		const { result } = review({
			action: "Nowhere",
			manifest: groupedVaultlet as unknown as Record<string, unknown>,
		});
		const reviewed = await result;

		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("Nowhere");
	});
});

/**
 * The mode a protocol says its contracts were built in, followed rather than assumed.
 *
 * It changes the commitment merkle root, so the same document with and without it describes
 * covenants at two different addresses, and both compile. A wallet ignoring it would derive a
 * well-formed address for a contract nobody deployed, then refuse against the money that is
 * actually there and report that the site had lied.
 */
describe("the build mode a document declares", () => {
	test("reaches the compiler for an ordinary derivation", async () => {
		const plain = review(withdraw(groupedVaultlet));
		const debug = review(withdraw(debugVaultlet));

		await plain.result;
		await debug.result;

		expect(plain.compiled.map((call) => call.includeDebugSymbols)).toEqual([false]);
		expect(debug.compiled.map((call) => call.includeDebugSymbols)).toEqual([true]);
	});

	test("and the compiler that takes the hashes a deployment's fields compute", async () => {
		const plain = review(openVault(groupedVaultlet));
		const debug = review(openVault(debugVaultlet));

		await plain.result;
		await debug.result;

		expect(plain.hashed.length).toBeGreaterThan(0);
		expect(plain.hashed.every((call) => call.includeDebugSymbols)).toBe(false);
		expect(debug.hashed.every((call) => call.includeDebugSymbols)).toBe(true);
	});

	test("so the deployment the same constructor creates differs between the two", async () => {
		const plain = await review(openVault(groupedVaultlet)).result;
		const debug = await review(openVault(debugVaultlet)).result;

		expect(isRefusal(plain) || isRefusal(debug)).toBe(false);

		if (isRefusal(plain) || isRefusal(debug)) {
			return;
		}

		expect(debug.createdInstance?.fields.RESERVE_COV_HASH).not.toBe(
			plain.createdInstance?.fields.RESERVE_COV_HASH,
		);
	});

	test("and is reported on every covenant the review establishes", async () => {
		const reviewed = await review(withdraw(debugVaultlet)).result;

		expect(isRefusal(reviewed) ? [] : reviewed.covenants.map((f) => f.includeDebugSymbols)).toEqual(
			[true],
		);
	});

	/**
	 * There is no third mode to build in. Refused before anything is compiled, because picking one
	 * would be this wallet deciding what the protocol meant about an address.
	 */
	test("a mode that cannot be read refuses before any contract is compiled", async () => {
		const { compiled, result } = review({
			action: "Withdraw",
			instance: DEPLOYMENT,
			manifest: { ...(groupedVaultlet as object), compile_debug_symbols: "yes" } as Record<
				string,
				unknown
			>,
			state: { utxos: [{ txid: "b".repeat(64), utxo_type: "vault", vout: 0 }] },
		});
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("neither on nor off");
		expect(compiled).toHaveLength(0);
	});
});

/**
 * What the review hands on about a covenant is everything the covenant was built from.
 *
 * A module that spends this covenant compiles the contract again to satisfy it. A compile that
 * differs in the source, the parameters, the leaves or the mode produces a different script, which
 * the covenant's own execution rejects — after a person has approved a transaction the wallet had
 * already checked. So all four travel, and the source travels as text: a path is a key into a
 * request, and asking the request again is the second resolution this exists to prevent.
 */
describe("the derivation the review carries out", () => {
	test("is everything the covenant was compiled from, with nothing left to look up", async () => {
		const { compiled, result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		if (isRefusal(reviewed)) {
			throw new Error(reviewed.reason);
		}

		const [found] = reviewed.covenants;
		const [asked] = compiled;

		expect({
			argumentsJson: found?.argumentsJson,
			extraLeavesJson: found?.extraLeavesJson,
			includeDebugSymbols: found?.includeDebugSymbols,
			source: found?.source,
		}).toEqual({
			argumentsJson: asked?.argumentsJson ?? "",
			extraLeavesJson: asked?.extraLeavesJson ?? "",
			includeDebugSymbols: asked?.includeDebugSymbols ?? false,
			source: asked?.source ?? "",
		});
	});

	/**
	 * Recompiling from the finding alone reproduces the same script. That is the property the
	 * finding exists for: nothing downstream reaches back into the request.
	 */
	test("recompiles to the same script without the request", async () => {
		const { compiled, result } = review(withdraw(groupedVaultlet));
		const reviewed = await result;

		if (isRefusal(reviewed)) {
			throw new Error(reviewed.reason);
		}

		const found = reviewed.covenants[0];
		const rebuilt = compiled.find(
			(call) =>
				call.source === found?.source &&
				call.argumentsJson === found.argumentsJson &&
				call.extraLeavesJson === found.extraLeavesJson &&
				call.includeDebugSymbols === found.includeDebugSymbols,
		);

		expect(rebuilt).toBeDefined();
		expect(found?.scriptPubKeyHex).toBe(DERIVED_SCRIPT);
	});

	test("names the path the document used it under, for a reader who has to find it", async () => {
		const reviewed = await review(withdraw(groupedVaultlet)).result;

		expect(isRefusal(reviewed) ? [] : reviewed.covenants.map((f) => f.sourcePath)).toEqual([
			"./vault.simf",
		]);
	});
});

/**
 * A compiler failing is a refusal, never a rejected promise. The review runs before the permission
 * gate, so a caller that sees an exception here cannot tell a wallet that declined from a wallet
 * that broke, and has nothing to show the person either way.
 */
describe("when the hash compiler fails", () => {
	test("a compiler that throws becomes a refusal naming the field", async () => {
		const { result } = review(openVault(groupedVaultlet), {
			hashedBy: () => {
				throw new Error("wasm module not loaded");
			},
		});
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("RESERVE_COV_HASH");
	});

	test("a compiler returning something that is not a script becomes one too", async () => {
		const { result } = review(openVault(groupedVaultlet), { hashedBy: () => "not hex" });
		const reviewed = await result;

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("not bytes");
	});

	/** The same, for the compiler that derives an address rather than a hash. */
	test("a covenant compiler that throws becomes a refusal naming the contract", async () => {
		const reviewed = await reviewManifestAction(
			{
				broadcast: false,
				contractSources: SOURCES,
				params: {},
				...withdraw(groupedVaultlet),
			} as ParsedLiquidProcessCtParams,
			{
				accountLabel: "liquid:testnet account 0",
				compile: () => {
					throw new Error("wasm module not loaded");
				},
				contractParamTypes: () => DECLARED,
				fundingUtxos: FUNDING,
				network: "liquid",
				policyAsset: POLICY_ASSET,
				readFeeRate: async () => 1000,
				readTxOut: async () => ({ ...COVENANT_HOLDING, scriptPubKeyHex: DERIVED_SCRIPT }),
				scriptPubKeyOf: () => DERIVED_SCRIPT,
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		);

		expect(isRefusal(reviewed)).toBe(true);
		expect(isRefusal(reviewed) ? reviewed.reason : "").toContain("./vault.simf");
	});
});
