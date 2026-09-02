import { describe, expect, test } from "bun:test";

import type { AssetEntry } from "../evaluation/assetLedger";
import { fundAssets } from "./assetFunding";
import type { SelectableUtxo } from "./coinSelection";

const POLICY = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "aa".repeat(32);

function utxo(amount: string, overrides: Partial<SelectableUtxo> = {}): SelectableUtxo {
	return {
		amount,
		spendable: true,
		txid: amount.padStart(64, "0"),
		txOut: "00",
		vout: 0,
		...overrides,
	};
}

function entry(asset: string, needed: bigint, overrides: Partial<AssetEntry> = {}): AssetEntry {
	return { asset, held: 0n, needed, ...overrides };
}

const CHANGE = { blinded: true, id: "token_change" };

function fund(entries: AssetEntry[], holdings: Record<string, SelectableUtxo[]>, feeSats = 500n) {
	return fundAssets(entries, {
		feeSats,
		headroomSats: 0n,
		holdings: (asset) => holdings[asset] ?? [],
		policyAsset: POLICY,
		reserved: [],
	});
}

describe("funding an action asset by asset", () => {
	test("takes each asset out of what the wallet holds in that one", () => {
		const result = fund([entry(POLICY, 0n), entry(TOKEN, 1000n, { change: CHANGE })], {
			[POLICY]: [utxo("900")],
			[TOKEN]: [utxo("1500")],
		});

		expect(
			result.ok && result.funded.map((funded) => funded.selected.map((one) => one.amount)),
		).toEqual([["900"], ["1500"]]);
	});

	// The fee is charged in one asset and is added to that one alone. A second asset picking up
	// a second fee would make the wallet demand money nobody is asking for.
	test("adds the fee to the network's own asset and to no other", () => {
		const short = fund([entry(POLICY, 0n)], { [POLICY]: [utxo("400")] }, 500n);
		const exact = fund([entry(TOKEN, 400n, { change: CHANGE })], { [TOKEN]: [utxo("400")] }, 500n);

		expect(short.ok).toBe(false);
		expect(exact.ok).toBe(true);
	});

	test("returns the exact surplus of every asset but the network's own", () => {
		const result = fund([entry(POLICY, 0n), entry(TOKEN, 1000n, { change: CHANGE })], {
			[POLICY]: [utxo("9000")],
			[TOKEN]: [utxo("1500")],
		});

		expect(result.ok && result.funded.map((funded) => funded.changeSats)).toEqual([0n, 500n]);
	});

	// What a covenant already holds is what the wallet does not have to find. Netting it per
	// asset is what lets an action pay out of the covenant it spends.
	test("counts what the transaction already brings before asking the wallet for anything", () => {
		const result = fund([entry(POLICY, 0n), entry(TOKEN, 1000n, { held: 1000n })], {
			[POLICY]: [utxo("9000")],
		});

		expect(result.ok && result.funded[1]?.selected).toEqual([]);
	});

	test("and asks for only the difference when it brings some of it", () => {
		const result = fund([entry(POLICY, 0n), entry(TOKEN, 1000n, { change: CHANGE, held: 600n })], {
			[POLICY]: [utxo("9000")],
			[TOKEN]: [utxo("500"), utxo("50")],
		});

		// Four hundred short, and the largest single output covers it. A wallet that had ignored
		// what the covenant holds would have taken both and still been short.
		expect(result.ok && result.funded[1]?.selected.map((one) => one.amount)).toEqual(["500"]);
		expect(result.ok && result.funded[1]?.changeSats).toBe(100n);
	});
});

describe("when one asset cannot be funded", () => {
	test("the refusal names the asset and what the account holds of it", () => {
		const result = fund([entry(POLICY, 0n), entry(TOKEN, 1000n)], {
			[POLICY]: [utxo("9000")],
			[TOKEN]: [utxo("40")],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain(TOKEN);
		expect(result.ok ? "" : result.reason).toContain("40");
		expect(result.ok ? "" : result.reject).toBe("shortfall");
	});

	// The refusal for another asset never mentions the fee, because no fee is charged in it.
	test("and never explains a shortfall in one asset by the fee charged in another", () => {
		const result = fund([entry(TOKEN, 1000n)], { [TOKEN]: [utxo("40")] });

		expect(result.ok ? "" : result.reason).not.toContain("fee");
	});

	test("a confidential holding is named as held back rather than counted", () => {
		const result = fund([entry(TOKEN, 1000n)], {
			[TOKEN]: [utxo("5000", { confidential: true })],
		});

		expect(result.ok ? "" : result.reason).toContain("5000");
		expect(result.ok ? "" : result.reason).toContain("unblinded address");
	});

	// Surplus with nowhere declared to go is value the transaction would destroy, so it is
	// refused rather than built. The network's own asset is exempt: its surplus is the fee's.
	test("a surplus the document declares no change output for is refused", () => {
		const result = fund([entry(TOKEN, 1000n)], { [TOKEN]: [utxo("1500")] });

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("500");
		expect(result.ok ? "" : result.reject).toBe("document-fault");
	});

	test("and the same surplus in the network's own asset is not, because the fee takes it", () => {
		const result = fund([entry(POLICY, 1000n)], { [POLICY]: [utxo("9000")] });

		expect(result.ok).toBe(true);
	});
});

describe("an output already committed to for an issuance", () => {
	const reserved = utxo("700");

	function withReserved(entries: AssetEntry[], holdings: Record<string, SelectableUtxo[]>) {
		return fundAssets(entries, {
			feeSats: 0n,
			headroomSats: 0n,
			holdings: (asset) => holdings[asset] ?? [],
			policyAsset: POLICY,
			reserved: [{ asset: TOKEN, utxo: reserved }],
		});
	}

	// It is an input of this transaction whether or not the arithmetic would have chosen it, so
	// what it brings counts and it is never chosen twice.
	test("counts towards its own asset and is not selected again", () => {
		const result = withReserved([entry(TOKEN, 1000n, { change: CHANGE })], {
			[TOKEN]: [reserved, utxo("400")],
		});

		expect(result.ok && result.funded[0]?.selected.map((one) => one.amount)).toEqual([
			"700",
			"400",
		]);
		expect(result.ok && result.funded[0]?.changeSats).toBe(100n);
	});

	test("and comes first, because the asset it mints is a statement about that output", () => {
		const result = withReserved([entry(TOKEN, 2000n, { change: CHANGE })], {
			[TOKEN]: [reserved, utxo("5000")],
		});

		expect(result.ok && result.funded[0]?.selected[0]).toBe(reserved);
	});
});
