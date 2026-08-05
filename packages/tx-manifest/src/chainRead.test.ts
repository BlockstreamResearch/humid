import { describe, expect, test } from "bun:test";

import transactions from "./__fixtures__/testnet-transactions.json";
import { createEsploraFeeRateReader, createEsploraTxOutReader } from "./chainRead";

// The transaction read asks for /tx/:txid/raw and gets consensus bytes back. The fee read is
// still JSON, which is Esplora's own shape for /fee-estimates.
const TXID = "a".repeat(64);

/** A real Liquid testnet transaction whose first output is explicit and taproot-locked. */
const FIXTURE = transactions.explicitTaproot;

function respondWith(body: unknown, ok = true, status = 200) {
	const calls: { init?: RequestInit; url: string }[] = [];

	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ init, url: String(url) });

		return {
			arrayBuffer: async () =>
				typeof body === "string"
					? Uint8Array.from(body.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)).buffer
					: new ArrayBuffer(0),
			json: async () => body,
			ok,
			status,
		} as Response;
	}) as unknown as typeof fetch;

	return { calls, fetchImpl };
}

describe("createEsploraTxOutReader", () => {
	test("reads the requested output out of the transaction's bytes", async () => {
		const { fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);
		const expected = FIXTURE.vout[0];

		await expect(read({ txid: TXID, vout: 0 })).resolves.toMatchObject({
			amountSats: String(expected.value),
			rawAssetId: expected.asset,
			scriptPubKeyHex: expected.scriptpubkey,
		});
	});

	// Every output of the same transaction, so an index is not being ignored.
	test("reads each output of a transaction as the chain reports it", async () => {
		const { fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		for (const [index, expected] of FIXTURE.vout.entries()) {
			await expect(read({ txid: TXID, vout: index })).resolves.toMatchObject({
				scriptPubKeyHex: expected.scriptpubkey,
			});
		}
	});

	// The raw route rather than the summary one: the Waterfalls server this wallet configures
	// for Liquid testnet answers 404 to /tx/:txid and serves /tx/:txid/raw, and every Esplora
	// serves both. Asking for the summary made the first live run impossible.
	test("asks for the transaction's bytes, trailing slash or not", async () => {
		const { calls, fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example/" }, fetchImpl);

		await read({ txid: TXID, vout: 0 });

		expect(calls[0]?.url).toBe(`https://esplora.example/tx/${TXID}/raw`);
	});

	// A private or authenticated backend is configured once, for lwk; this read must not
	// need it configured a second time.
	test("sends the endpoint's configured headers", async () => {
		const { calls, fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader(
			{
				headers: [{ name: "authorization", value: "Bearer token" }],
				url: "https://esplora.example",
			},
			fetchImpl,
		);

		await read({ txid: TXID, vout: 0 });

		expect(calls[0]?.init?.headers).toMatchObject({ authorization: "Bearer token" });
	});

	test("rejects something that is not a transaction id before asking anyone", async () => {
		const { calls, fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: "nope", vout: 0 })).rejects.toThrow();
		expect(calls).toHaveLength(0);
	});

	test("rejects a negative output index before asking anyone", async () => {
		const { calls, fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: -1 })).rejects.toThrow();
		expect(calls).toHaveLength(0);
	});

	test("fails when the endpoint does not answer successfully", async () => {
		const { fetchImpl } = respondWith({}, false, 404);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: 0 })).rejects.toThrow();
	});

	test("fails when the transaction has no output at that index", async () => {
		const { fetchImpl } = respondWith(FIXTURE.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: 7 })).rejects.toThrow();
	});

	// Failing loudly beats returning something shaped like an answer: a caller that got an
	// empty script would compare a rebuilt covenant against nothing.
	test("fails when what came back is not a transaction", async () => {
		const { fetchImpl } = respondWith("0200");
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: 0 })).rejects.toThrow();
	});

	// A confidential output parses; what it cannot do is report an amount or an asset. The
	// refusal belongs to the caller that needs one, not here.
	test("reads a confidential output without inventing its amount", async () => {
		const { fetchImpl } = respondWith(transactions.confidential.raw);
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);
		const result = await read({ txid: TXID, vout: 0 });

		expect(result.scriptPubKeyHex).toBe(transactions.confidential.vout[0].scriptpubkey);
		expect(result.amountSats).toBeUndefined();
		expect(result.rawAssetId).toBeUndefined();
	});
});

describe("createEsploraFeeRateReader", () => {
	// Esplora keys fee estimates by confirmation target, in sats per vbyte.
	const ESTIMATES = { "1": 2.5, "144": 0.1, "6": 1 };

	test("returns the requested target, converted to sats per kvb", async () => {
		const { fetchImpl } = respondWith(ESTIMATES);
		const read = createEsploraFeeRateReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read(6)).resolves.toBe(1000);
	});

	// Being wrong towards a longer wait is the safe direction; being wrong towards a
	// shorter one silently overpays.
	test("falls back to the nearest slower target when the exact one is absent", async () => {
		const { fetchImpl } = respondWith(ESTIMATES);
		const read = createEsploraFeeRateReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read(3)).resolves.toBe(1000);
	});

	test("asks the configured endpoint", async () => {
		const { calls, fetchImpl } = respondWith(ESTIMATES);
		const read = createEsploraFeeRateReader({ url: "https://esplora.example/" }, fetchImpl);

		await read(1);

		expect(calls[0]?.url).toBe("https://esplora.example/fee-estimates");
	});

	test("fails rather than guessing when the endpoint does not answer", async () => {
		const { fetchImpl } = respondWith({}, false, 503);
		const read = createEsploraFeeRateReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read(1)).rejects.toThrow();
	});

	test("fails rather than guessing when no usable estimate comes back", async () => {
		const { fetchImpl } = respondWith({ "1": 0 });
		const read = createEsploraFeeRateReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read(1)).rejects.toThrow();
	});
});
