import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import mutualManifest from "../__fixtures__/mutual.manifest.json";
import vaultlet from "../__fixtures__/vaultlet.manifest.json";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import {
	asRefusal,
	asReview,
	chainHolding,
	COMPILED,
	DERIVED,
	DERIVED_SCRIPT,
	type Document,
	edited,
	ELSEWHERE_SCRIPT,
	POLICY_ASSET,
	PUBKEY,
	review,
	type ReviewDependencies,
	TXID,
	WALLET_SCRIPT,
} from "./harness";

const ASSET_STATED = `a0${"00".repeat(30)}0a`;
const ASSET_COMMITTED = `0a${"00".repeat(30)}a0`;
const RESERVE_HASH = "cc".repeat(32);
const VAULT_PATH = "./vault.simf";

const SOURCES = Object.fromEntries(
	["vault", "reserve", "guard", "left", "right"].map((name) => [
		`./${name}.simf`,
		readFileSync(new URL(`../__fixtures__/contracts/${name}.simf`, import.meta.url), "utf8"),
	]),
);

const VAULTLET = vaultlet as unknown as Document;
const DEBUG_VAULTLET = { ...VAULTLET, simplicity_hl: { debug_symbols: true } };

const DEPLOYMENT = {
	instance: {
		fields: {
			GUARD_COV_HASH: "dd".repeat(32),
			OWNER_PUB_KEY: PUBKEY,
			RESERVE_COV_HASH: RESERVE_HASH,
			TIMEOUT: "900000",
			VAULT_AMOUNT: "50000",
			VAULT_ASSET_ID: ASSET_STATED,
		},
		template: "vaultlet_contract",
	},
};

type Compiled = {
	argumentsJson: string;
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	source: string;
};

function vaultletReview(
	request: Partial<ParsedLiquidProcessCtParams>,
	overrides: Partial<ReviewDependencies> & { hashedBy?: () => string } = {},
) {
	const compiled: Compiled[] = [];
	const hashed: { includeDebugSymbols: boolean; source: string }[] = [];
	const { hashedBy, ...dependencies } = overrides;

	const result = review(
		{ broadcast: false, contractSources: SOURCES, params: {}, ...request } as never,
		{
			compile: ({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }) => {
				compiled.push({ argumentsJson, extraLeavesJson, includeDebugSymbols, source });

				return COMPILED;
			},
			covenantParamTypes: () => ({ SLOT_COUNT: "u8", WITH_BURN: "bool" }),
			scriptPubKeyOf: ({ argumentsJson, includeDebugSymbols, source }) => {
				hashed.push({ includeDebugSymbols, source });

				return (
					hashedBy?.() ??
					`5120${Bun.hash(JSON.stringify([source, argumentsJson, includeDebugSymbols]))
						.toString(16)
						.padStart(64, "0")}`
				);
			},
			...dependencies,
		},
	);

	return { compiled, hashed, result };
}

const withdraw = (manifest: Document = VAULTLET) => ({
	action: "Withdraw",
	instance: DEPLOYMENT,
	manifest,
	state: { utxos: [{ txid: TXID, utxo_type: "vault", vout: 0 }] },
});

const openVault = (manifest: Document = VAULTLET) => ({
	action: "OpenVault",
	manifest,
	params: {
		OWNER_PUB_KEY: PUBKEY,
		TIMEOUT: "900000",
		VAULT_AMOUNT: "50000",
		VAULT_ASSET_ID: ASSET_STATED,
	},
});

const reviewedAs = async (request: Partial<ParsedLiquidProcessCtParams>) =>
	asReview(await vaultletReview(request).result);

describe("a template action against a deployment that exists", () => {
	test("reports which template the action belongs to", async () => {
		expect((await reviewedAs(withdraw())).boundTo).toBe("vaultlet_contract");
	});

	test("rebuilds its covenant from the deployment's own fields, at the template's declared types", async () => {
		const { compiled, result } = vaultletReview(withdraw());

		await result;

		expect(JSON.parse(compiled[0]?.argumentsJson ?? "{}")).toEqual({
			OWNER_PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` },
			RESERVE_COV_HASH: { type: "u256", value: `0x${RESERVE_HASH}` },
			SLOT_COUNT: { type: "u8", value: "2" },
			VAULT_ASSET_ID: { type: "u256", value: `0x${ASSET_COMMITTED}` },
			WITH_BURN: { type: "bool", value: "false" },
		});
	});

	test("checks what it rebuilt against the chain, carrying out exactly what it compiled", async () => {
		const { compiled, result } = vaultletReview(withdraw());
		const { covenants } = asReview(await result);
		const [asked] = compiled;

		expect(covenants).toEqual([
			{
				address: DERIVED,
				argumentsJson: asked?.argumentsJson ?? "",
				cmr: "cc".repeat(32),
				extraLeavesJson: asked?.extraLeavesJson ?? "",
				includeDebugSymbols: false,
				role: "spent",
				scriptPubKeyHex: DERIVED_SCRIPT,
				source: SOURCES[VAULT_PATH],
				sourcePath: VAULT_PATH,
				tapleafHash: "1e".repeat(32),
				utxoType: "vault",
				verified: "matches-chain",
			},
		]);
	});

	test("refuses when the funds are locked by a different contract", async () => {
		const { result } = vaultletReview(withdraw(), { readTxOut: chainHolding(ELSEWHERE_SCRIPT) });
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("covenant-mismatch");
		expect(refusal.reason).toContain("not the contract the site");
	});

	test("refuses without the deployment file, naming the file", async () => {
		const { compiled, result } = vaultletReview({ ...withdraw(), instance: undefined });
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("incomplete-request");
		expect(refusal.reason).toContain("is an action of vaultlet_contract");
		expect(refusal.reason).toContain("utxo type vault / script / RESERVE_COV_HASH");
		expect(compiled).toHaveLength(0);
	});

	test("resolves the output's amount from the deployment rather than from the request", async () => {
		expect((await reviewedAs(withdraw())).outputs).toEqual([
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

	test("carries no deployment, since it only spends what exists", async () => {
		expect((await reviewedAs(withdraw())).createdInstance).toBeUndefined();
	});
});

describe("the constructor of the same template", () => {
	test("is reviewed with no deployment to read, and reports the one it creates", async () => {
		const { createdInstance } = await reviewedAs(openVault());

		expect(createdInstance?.fields.OWNER_PUB_KEY).toBe(PUBKEY);
		expect(createdInstance?.fields.RESERVE_COV_HASH).toHaveLength(64);
		expect(createdInstance?.rounds).toBe(2);
	});

	test("works out a field the document computes rather than recording its text", async () => {
		const manifest = edited(VAULTLET, (copy) => {
			const templates = copy.contract_templates as Record<string, { actions: Document }>;
			const created = (templates.vaultlet_contract!.actions.OpenVault as Document)
				.create_instance as { fields: Document };

			created.fields.VAULT_AMOUNT = "params.VAULT_AMOUNT * 2";
		});

		expect((await reviewedAs(openVault(manifest))).createdInstance?.fields.VAULT_AMOUNT).toBe(
			"100000",
		);
	});

	test("and leaves a literal alone, however much it looks like arithmetic", async () => {
		expect((await reviewedAs(openVault())).createdInstance?.fields.VAULT_ASSET_ID).toBe(
			ASSET_STATED,
		);
	});

	test("reports the covenant it creates as one with nothing yet to compare against", async () => {
		expect((await reviewedAs(openVault())).covenants.map((found) => found.verified)).toEqual([
			"not-yet-onchain",
		]);
	});

	test("never consults the chain for something that does not exist yet", async () => {
		let asked = 0;

		await vaultletReview(openVault(), {
			readTxOut: async (outpoint) => {
				asked += 1;

				return chainHolding()(outpoint);
			},
		}).result;

		expect(asked).toBe(0);
	});

	test("derives the covenant it creates from the deployment it worked out", async () => {
		const { compiled, result } = vaultletReview(openVault());
		const { createdInstance } = asReview(await result);
		const vault = compiled.findLast((call) => call.source === SOURCES[VAULT_PATH]);

		expect(JSON.parse(vault?.argumentsJson ?? "{}")).toMatchObject({
			RESERVE_COV_HASH: {
				type: "u256",
				value: `0x${createdInstance?.fields.RESERVE_COV_HASH ?? ""}`,
			},
		});
	});
});

describe("what a review still refuses", () => {
	test("a deployment whose covenant hashes never settle", async () => {
		const { compiled, result } = vaultletReview({
			action: "Knot",
			manifest: mutualManifest as unknown as Document,
		});
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("never settle");
		expect(compiled).toHaveLength(0);
	});

	test("a covenant wired to a value when nothing says what the contract declares", async () => {
		const { result } = vaultletReview(withdraw(), { covenantParamTypes: undefined });

		expect(asRefusal(await result).reject).toBe("document-fault");
	});

	test("an action the document does not declare", async () => {
		const { result } = vaultletReview({ action: "Nowhere", manifest: VAULTLET });
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("no-such-action");
		expect(refusal.reason).toContain("Nowhere");
	});
});

describe("the build mode a document declares", () => {
	test("reaches the compiler for an ordinary derivation", async () => {
		const plain = vaultletReview(withdraw());
		const debug = vaultletReview(withdraw(DEBUG_VAULTLET));

		await plain.result;
		await debug.result;

		expect(plain.compiled.map((call) => call.includeDebugSymbols)).toEqual([false]);
		expect(debug.compiled.map((call) => call.includeDebugSymbols)).toEqual([true]);
	});

	test("and the compiler that takes the hashes a deployment's fields compute", async () => {
		const plain = vaultletReview(openVault());
		const debug = vaultletReview(openVault(DEBUG_VAULTLET));

		await plain.result;
		await debug.result;

		expect(plain.hashed.length).toBeGreaterThan(0);
		expect(plain.hashed.every((call) => call.includeDebugSymbols)).toBe(false);
		expect(debug.hashed.every((call) => call.includeDebugSymbols)).toBe(true);
	});

	test("so the deployment the same constructor creates differs between the two", async () => {
		const plain = await reviewedAs(openVault());
		const debug = await reviewedAs(openVault(DEBUG_VAULTLET));

		expect(debug.createdInstance?.fields.RESERVE_COV_HASH).not.toBe(
			plain.createdInstance?.fields.RESERVE_COV_HASH,
		);
	});

	test("and is reported on every covenant the review establishes", async () => {
		const { covenants } = await reviewedAs(withdraw(DEBUG_VAULTLET));

		expect(covenants.map((found) => found.includeDebugSymbols)).toEqual([true]);
	});

	test("a mode that cannot be read refuses before any contract is compiled", async () => {
		const { compiled, result } = vaultletReview(
			withdraw({ ...VAULTLET, simplicity_hl: { debug_symbols: "yes" } }),
		);
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("unreadable-build-mode");
		expect(refusal.reason).toContain("neither on nor off");
		expect(compiled).toHaveLength(0);
	});
});

describe("when a compiler fails", () => {
	test("a hash compiler that throws becomes a refusal naming the field", async () => {
		const { result } = vaultletReview(openVault(), {
			hashedBy: () => {
				throw new Error("wasm module not loaded");
			},
		});
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("RESERVE_COV_HASH");
	});

	test("a hash compiler returning something that is not a script becomes one too", async () => {
		const { result } = vaultletReview(openVault(), { hashedBy: () => "not hex" });
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("not bytes");
	});

	test("a covenant compiler that throws becomes a refusal naming the contract", async () => {
		const { result } = vaultletReview(withdraw(), {
			compile: () => {
				throw new Error("wasm module not loaded");
			},
		});
		const refusal = asRefusal(await result);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain(VAULT_PATH);
	});
});
