import { describe, expect, test } from "bun:test";

import { normaliseManifest } from "../document/normalise";
import { completeSuppliedInstance } from "./instance";

/**
 * Reading a deployment somebody else created.
 *
 * Half a deployment's fields are covenant script hashes, which are compiler output. A site that
 * did not create the deployment holds the ordinary values and cannot make the rest — so an action
 * reading one would refuse for want of a value only a wallet can produce. The document already
 * says how each is computed, in the constructor's own block.
 */

const DOCUMENT = {
	classes: {
		Vault: {
			methods: {
				Open: {
					create_instance: {
						fields: {
							ASSET: "$params.ASSET",
							COV_HASH: {
								params: { ASSET_ID: { type: "liquid.asset_id", value: "ASSET" } },
								simf: "./v.simf",
								type: "tapleaf",
							},
						},
					},
				},
				Spend: { inputs: [{ id: "a", utxo_source: { utxo_type: "v" } }] },
			},
		},
	},
	utxo_types: { v: { script: { compile_params: { ASSET_ID: "ASSET" }, source: "./v.simf" } } },
};

const { manifest } = normaliseManifest(DOCUMENT as unknown as Record<string, unknown>);
const spend = manifest.actions.find((action) => action.name === "Spend")!;
const open = manifest.actions.find((action) => action.name === "Open")!;
const ASSET = "aa".repeat(32);

function complete(action: typeof spend, supplied: Record<string, unknown>) {
	return completeSuppliedInstance(manifest, action, supplied, {
		contractSources: { "./v.simf": "fn main() {}" },
		hashCovenant: () => "cc".repeat(32),
	});
}

describe("a deployment read rather than created", () => {
	test("gains the fields only a compiler could produce", () => {
		const result = complete(spend, { ASSET });

		expect(result.ok && result.fields).toEqual({ ASSET, COV_HASH: "cc".repeat(32) });
	});

	test("keeps what the site supplied, because that is what the deployment was recorded with", () => {
		const result = complete(spend, { ASSET, COV_HASH: "dd".repeat(32) });

		expect(result.ok && result.fields.COV_HASH).toBe("dd".repeat(32));
	});

	test("leaves the constructor's own reading alone", () => {
		const result = complete(open, { ASSET });

		expect(result.ok && result.fields).toEqual({ ASSET });
	});
});

/**
 * A deployment whose constructor reads a parameter the document states a default for.
 *
 * `ZERO_HASH` in the lending document is the shape: a constant the deployment was recorded
 * with, declared once in the constructor's parameters and never sent by anybody. A site
 * reading that deployment holds the values the indexer publishes and has no reason to carry
 * the document's own constants — asking it for one asks it to send back what the document
 * already says.
 */
const WITH_DEFAULT = {
	classes: {
		Vault: {
			methods: {
				Open: {
					create_instance: {
						fields: {
							ASSET: "$params.ASSET",
							COV_HASH: {
								params: {
									ASSET_ID: { type: "liquid.asset_id", value: "ASSET" },
									ZERO: { type: "bytes32", value: "ZERO_HASH" },
								},
								simf: "./v.simf",
								type: "tapleaf",
							},
							ZERO_HASH: "$params.ZERO_HASH",
						},
					},
					params: {
						ASSET: { type: "liquid.asset_id" },
						ZERO_HASH: { default: "00".repeat(32), type: "bytes32" },
					},
				},
				Spend: { inputs: [{ id: "a", utxo_source: { utxo_type: "v" } }] },
			},
		},
	},
	utxo_types: { v: { script: { compile_params: { ASSET_ID: "ASSET" }, source: "./v.simf" } } },
};

const withDefault = normaliseManifest(WITH_DEFAULT as unknown as Record<string, unknown>).manifest;

function completeWithDefaults(name: string, supplied: Record<string, unknown>) {
	return completeSuppliedInstance(
		withDefault,
		withDefault.actions.find((action) => action.name === name)!,
		supplied,
		{ contractSources: { "./v.simf": "fn main() {}" }, hashCovenant: () => "cc".repeat(32) },
	);
}

describe("a constant the document states rather than the site", () => {
	test("is read from the constructor's own default", () => {
		const result = completeWithDefaults("Spend", { ASSET });

		expect(result.ok && result.fields).toEqual({
			ASSET,
			COV_HASH: "cc".repeat(32),
			ZERO_HASH: "00".repeat(32),
		});
	});

	test("still loses to what the site supplied", () => {
		const result = completeWithDefaults("Spend", { ASSET, ZERO_HASH: "11".repeat(32) });

		expect(result.ok && result.fields.ZERO_HASH).toBe("11".repeat(32));
	});
});

/**
 * A parameter the document computes can name a field of the deployment that only the wallet
 * can produce — the lending document's repayment splits are computed from `CURRENT_DEBT`,
 * which its constructor works out and no site holds. Filling parameters before completing the
 * deployment refuses on a field the wallet was one step away from deriving.
 */
const COMPUTES_FROM_A_DERIVED_FIELD = {
	classes: {
		Vault: {
			methods: {
				Open: {
					create_instance: {
						fields: { AMOUNT: "$params.AMOUNT", DEBT: "params.AMOUNT + 50" },
					},
					params: { AMOUNT: { type: "u64" } },
				},
				Settle: {
					inputs: [{ id: "a", utxo_source: { utxo_type: "v" } }],
					params: { SHARE: { compute: "instance.DEBT - 10", type: "u64" } },
				},
			},
		},
	},
	utxo_types: { v: { script: { compile_params: {}, source: "./v.simf" } } },
};

describe("a parameter computed from a field the constructor worked out", () => {
	test("is answered once the deployment is completed", () => {
		const { manifest: document } = normaliseManifest(
			COMPUTES_FROM_A_DERIVED_FIELD as unknown as Record<string, unknown>,
		);
		const settle = document.actions.find((action) => action.name === "Settle")!;
		const completed = completeSuppliedInstance(
			document,
			settle,
			{ AMOUNT: "1000" },
			{
				contractSources: { "./v.simf": "fn main() {}" },
				hashCovenant: () => "cc".repeat(32),
			},
		);

		expect(completed.ok && completed.fields.DEBT).toBe("1050");
	});
});
