import { describe, expect, test } from "bun:test";

import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	type EsploraEndpoint,
} from "./chainRead";
import { txOutAt } from "./rawTransaction";

/**
 * Every case here is built as bytes, because that is what these readers read.
 *
 * A fixture assembled as an object shaped like the answer would let this file assert something
 * the reader could never see. So a transaction is written the way the chain writes one and
 * handed over as the endpoint would hand it over, as an array buffer.
 */
const POLICY_ASSET = "aa".repeat(32);
const TOKEN_ASSET = "bb".repeat(32);
const FIRST_SCRIPT = `0014${"11".repeat(20)}`;
const SECOND_SCRIPT = `0014${"22".repeat(20)}`;
const TXID = "a".repeat(64);

function assetField(assetId: string): string {
	return `01${(assetId.match(/../g) ?? []).toReversed().join("")}`;
}

function explicit(sats: bigint, scriptHex: string, assetId = POLICY_ASSET): string {
	const value = `01${sats.toString(16).padStart(16, "0")}`;
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${assetField(assetId)}${value}00${length}${scriptHex}`;
}

/** A confidential output: an asset commitment, a value commitment, a nonce and a script. */
function hidden(scriptHex: string): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `0a${"33".repeat(32)}08${"44".repeat(32)}02${"55".repeat(32)}${length}${scriptHex}`;
}

function transaction(outputs: string[]): string {
	const input = `${"aa".repeat(32)}0000000000ffffffff`;

	return (
		`0200000000` +
		`01${input}` +
		`${outputs.length.toString(16).padStart(2, "0")}${outputs.join("")}00000000`
	);
}

function endpointReturning(
	body: string | Uint8Array,
	status = 200,
): [EsploraEndpoint, typeof fetch] {
	const fetchImpl = (() =>
		Promise.resolve({
			arrayBuffer: () =>
				Promise.resolve(
					typeof body === "string"
						? Uint8Array.from((body.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))
								.buffer
						: body.buffer,
				),
			json: () => Promise.resolve(JSON.parse(String(body))),
			ok: status >= 200 && status < 300,
			status,
			text: () => Promise.resolve(String(body)),
		})) as unknown as typeof fetch;

	return [{ url: "https://example.invalid/api/" }, fetchImpl];
}

describe("reading one output out of a transaction's own bytes", () => {
	const built = transaction([
		explicit(1000n, FIRST_SCRIPT),
		explicit(7n, SECOND_SCRIPT, TOKEN_ASSET),
		explicit(500n, ""),
	]);

	test("carries the output's own bytes rather than a re-encoding of its fields", () => {
		const found = txOutAt(built, 1);

		// The exact bytes the transaction holds. A signing module spending this output is given
		// these and nothing else, so a value read out and put back — differing by a byte in a
		// way nothing here would notice — is a signature over a transaction nobody accepts.
		expect(found.ok && found.txOut.txOutHex).toBe(explicit(7n, SECOND_SCRIPT, TOKEN_ASSET));
		expect(found.ok && found.txOut.rawAssetId).toBe(TOKEN_ASSET);
		expect(found.ok && found.txOut.amountSats).toBe("7");
	});

	test("reports a hidden output as hiding rather than as holding nothing", () => {
		const confidential = transaction([hidden(FIRST_SCRIPT), explicit(500n, "")]);
		const found = txOutAt(confidential, 0);

		expect(found.ok && found.txOut.amountSats).toBeUndefined();
		expect(found.ok && found.txOut.rawAssetId).toBeUndefined();
		expect(found.ok && found.txOut.txOutHex).toBe(hidden(FIRST_SCRIPT));
	});

	test("refuses an index the transaction has no output at", () => {
		expect(txOutAt(built, 9)).toEqual({
			ok: false,
			reason: "The transaction carries 3 outputs, so there is none at 9.",
		});
	});

	test("refuses an index that is not one", () => {
		expect(txOutAt(built, -1).ok).toBe(false);
		expect(txOutAt(built, 1.5).ok).toBe(false);
	});

	test("refuses bytes that are not a whole transaction", () => {
		expect(txOutAt(`${built}ff`, 0).ok).toBe(false);
	});
});

describe("the Esplora output reader", () => {
	const built = transaction([explicit(1000n, FIRST_SCRIPT), explicit(500n, "")]);

	test("asks for the raw transaction and reads the numbered output out of it", async () => {
		const [endpoint, fetchImpl] = endpointReturning(built);
		const read = createEsploraTxOutReader(endpoint, fetchImpl);

		await expect(read({ txid: TXID, vout: 0 })).resolves.toEqual({
			amountSats: "1000",
			rawAssetId: POLICY_ASSET,
			scriptPubKeyHex: FIRST_SCRIPT,
			txOutHex: explicit(1000n, FIRST_SCRIPT),
		});
	});

	// The txid arrives from a state file the site supplied. Anything that is not thirty-two
	// bytes of hex is a path segment rather than an identifier, and it is refused before it is
	// put into a URL rather than after the endpoint complains about it.
	test("refuses a txid that is not one before it reaches the endpoint", async () => {
		const [endpoint, fetchImpl] = endpointReturning(built);
		const read = createEsploraTxOutReader(endpoint, fetchImpl);

		await expect(read({ txid: "../../etc", vout: 0 })).rejects.toThrow(
			"Not a transaction id: ../../etc",
		);
	});

	test("refuses an output index that is not one", async () => {
		const [endpoint, fetchImpl] = endpointReturning(built);
		const read = createEsploraTxOutReader(endpoint, fetchImpl);

		await expect(read({ txid: TXID, vout: -1 })).rejects.toThrow("Not an output index: -1");
	});

	test("reports the status when the endpoint will not answer", async () => {
		const [endpoint, fetchImpl] = endpointReturning(built, 404);
		const read = createEsploraTxOutReader(endpoint, fetchImpl);

		await expect(read({ txid: TXID, vout: 0 })).rejects.toThrow("404");
	});
});

describe("the Esplora fee-rate reader", () => {
	test("takes the target asked for, in base units per kilo-vbyte", async () => {
		const [endpoint, fetchImpl] = endpointReturning(JSON.stringify({ "1": 4, "6": 2, "12": 1 }));

		await expect(createEsploraFeeRateReader(endpoint, fetchImpl)(6)).resolves.toBe(2000);
	});

	// Paying for a longer wait than asked is the safe direction to be wrong in; paying for a
	// shorter one is the wallet spending money nobody agreed to.
	test("falls to the nearest slower target when the one asked for is not quoted", async () => {
		const [endpoint, fetchImpl] = endpointReturning(JSON.stringify({ "1": 4, "25": 1 }));

		await expect(createEsploraFeeRateReader(endpoint, fetchImpl)(6)).resolves.toBe(1000);
	});

	test("refuses rather than defaulting when nothing usable comes back", async () => {
		const [endpoint, fetchImpl] = endpointReturning(JSON.stringify({ "6": 0 }));

		await expect(createEsploraFeeRateReader(endpoint, fetchImpl)(6)).rejects.toThrow(
			"No usable fee estimate",
		);
	});
});
