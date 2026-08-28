import { describe, expect, test } from "bun:test";

import { assetFromEntropy, deriveNewIssuance } from "./issuance";

/**
 * Assets that exist on Liquid, and the outputs they were issued from.
 *
 * The derivation is nowhere in the format's own documents, so an expectation written from
 * this implementation would prove only that it is consistent with itself. Each case below is
 * one asset the chain already carries: its issuance outpoint, the issuer contract that
 * issuance committed to, and the asset and reissuance-token ids that came out. Anything but
 * the exact rule Elements uses reproduces none of them.
 *
 * Read on 2026-08-13 from Blockstream's Liquid Esplora, `GET /liquid/api/asset/<id>`, which
 * reports each asset's `issuance_prevout`, `contract_hash` and `reissuance_token`.
 */
const ON_CHAIN = [
	{
		asset: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2",
		contractHash: "3c7f0a53c2ff5b99590620d7f6604a7a3a7bfbaaa6aa61f7bfc7833ca03cde82",
		name: "Tether USD",
		reissuanceToken: "59fe4d2127ba9f16bd6850a3e6271a166e7ed2e1669f6c107d655791c94ee98f",
		txid: "9596d259270ef5bac0020435e6d859aea633409483ba64e232b8ba04ce288668",
		vout: 0,
	},
	{
		asset: "123465c803ae336c62180e52d94ee80d80828db54df9bedbb9860060f49de2eb",
		contractHash: "d6cb01732239e8c317699c33ef525a8a1419ebf9a2ad318edbf8135f1665a773",
		name: "Scamcoinbot token",
		reissuanceToken: "2f7179e260a8046f02be25dec6abcf0a2c1bd3e6e13dd29ed67570e1e71a55b7",
		txid: "fc2535f2e4fc2ef1d19b832248e3edc2c3f4c4e3ee9c2bc51777bd738a6f9582",
		// The index is part of what is hashed, so at least one case has to be issued from
		// somewhere other than the first output or a reader of the index proves nothing.
		vout: 10,
	},
	{
		asset: "4d4354944366ea1e33f27c37fec97504025d6062c551208f68597d1ed40ec53e",
		contractHash: "56cbf179ec75145ef54d88ff50284175852f926bf2d8d06f3e2deedbdf623779",
		name: "Magical Crypto Friends",
		reissuanceToken: "bc1e0094f30bc863610baf601ede6b3dda5cdb1b7d1a7831c93f011282924da3",
		txid: "839e819d74ac98110fce63a3dab3a1075bbddcad811e0e125641989581919ab0",
		vout: 1,
	},
	{
		asset: "beebee1a548fbb20280e539b697de076d87859a25c2983ebc55f2d8bec40abc3",
		contractHash: "6e8198a20900717b87437261967214e2af0bb4d73c1134580b25ec597887203a",
		name: "Beebee",
		reissuanceToken: "fc061c7585a4f166d251ef4f5afd7c63e33358582426f06070cfb286249926cb",
		txid: "27e6bd36daef786775768a6b106053d0f2f10e03b6f278715931caa00662138d",
		vout: 3,
	},
];

describe("the asset a first issuance creates", () => {
	for (const known of ON_CHAIN) {
		test(`is the one Liquid holds for ${known.name}`, () => {
			const derived = deriveNewIssuance({ txid: known.txid, vout: known.vout }, known.contractHash);

			expect(derived?.asset).toBe(known.asset);
		});

		test(`carries ${known.name}'s reissuance token`, () => {
			const derived = deriveNewIssuance({ txid: known.txid, vout: known.vout }, known.contractHash);

			expect(derived?.reissuanceToken).toBe(known.reissuanceToken);
		});
	}

	// Every issuance a manifest declares commits to nothing, so the default is the case this
	// wallet actually runs and it must be the empty commitment rather than a repeat of one.
	test("commits to no issuer contract unless one is given", () => {
		const [known] = ON_CHAIN;

		if (!known) {
			throw new Error("no chain vectors");
		}

		const withoutContract = deriveNewIssuance({ txid: known.txid, vout: known.vout });
		const withZeroes = deriveNewIssuance({ txid: known.txid, vout: known.vout }, "0".repeat(64));

		expect(withoutContract?.asset).toBe(withZeroes?.asset ?? "");
		expect(withoutContract?.asset).not.toBe(known.asset);
	});

	test("changes when the output it is issued from changes", () => {
		const [known] = ON_CHAIN;

		if (!known) {
			throw new Error("no chain vectors");
		}

		const first = deriveNewIssuance({ txid: known.txid, vout: 0 });
		const second = deriveNewIssuance({ txid: known.txid, vout: 1 });

		expect(first?.asset).not.toBe(second?.asset ?? "");
	});

	test("is not derivable from something that is not an outpoint", () => {
		expect(deriveNewIssuance({ txid: "aabb", vout: 0 })).toBeUndefined();
		expect(deriveNewIssuance({ txid: "a".repeat(64), vout: -1 })).toBeUndefined();
	});
});

describe("the asset a reissuance mints", () => {
	// A reissuance has no outpoint to derive from: it mints the asset that already exists,
	// which is why the entropy is the thing a protocol has to have kept.
	test("is the same asset, from the entropy the first issuance left", () => {
		const [known] = ON_CHAIN;

		if (!known) {
			throw new Error("no chain vectors");
		}

		const first = deriveNewIssuance({ txid: known.txid, vout: known.vout }, known.contractHash);

		expect(assetFromEntropy(first?.entropy ?? "")).toBe(known.asset);
	});

	test("is not derivable from something that is not an entropy", () => {
		expect(assetFromEntropy("")).toBeUndefined();
		expect(assetFromEntropy("zz".repeat(32))).toBeUndefined();
	});
});
