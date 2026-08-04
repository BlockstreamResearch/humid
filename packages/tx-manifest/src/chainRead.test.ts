import { describe, expect, test } from "bun:test";

import { createEsploraFeeRateReader, createEsploraTxOutReader } from "./chainRead";

// Response shapes are Esplora's documented ones: /tx/:txid returns a transaction whose
// vout entries carry scriptpubkey and scriptpubkey_address.
const TXID = "a".repeat(64);

function respondWith(body: unknown, ok = true, status = 200) {
	const calls: { init?: RequestInit; url: string }[] = [];

	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ init, url: String(url) });

		return {
			json: async () => body,
			ok,
			status,
		} as Response;
	}) as unknown as typeof fetch;

	return { calls, fetchImpl };
}

const OUTPUT = {
	asset: "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d",
	scriptpubkey: "5120aabb",
	scriptpubkey_address: "tex1p_covenant",
	value: 5000,
};

describe("createEsploraTxOutReader", () => {
	test("reads the requested output", async () => {
		const { fetchImpl } = respondWith({
			vout: [{ scriptpubkey: "00", scriptpubkey_address: "other" }, OUTPUT],
		});
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: 1 })).resolves.toMatchObject({
			amountSats: "5000",
			scriptPubKeyAddress: "tex1p_covenant",
			scriptPubKeyHex: "5120aabb",
		});
	});

	test("asks the configured endpoint, trailing slash or not", async () => {
		const { calls, fetchImpl } = respondWith({ vout: [OUTPUT] });
		const read = createEsploraTxOutReader({ url: "https://esplora.example/" }, fetchImpl);

		await read({ txid: TXID, vout: 0 });

		expect(calls[0]?.url).toBe(`https://esplora.example/tx/${TXID}`);
	});

	// A private or authenticated backend is configured once, for lwk; this read must not
	// need it configured a second time.
	test("sends the endpoint's configured headers", async () => {
		const { calls, fetchImpl } = respondWith({ vout: [OUTPUT] });
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
		const { calls, fetchImpl } = respondWith({ vout: [OUTPUT] });
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: "nope", vout: 0 })).rejects.toThrow();
		expect(calls).toHaveLength(0);
	});

	test("rejects a negative output index before asking anyone", async () => {
		const { calls, fetchImpl } = respondWith({ vout: [OUTPUT] });
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
		const { fetchImpl } = respondWith({ vout: [OUTPUT] });
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: 7 })).rejects.toThrow();
	});

	// A confidential output has no scriptpubkey_address in some Esplora deployments;
	// failing loudly beats returning an object with an empty address that a comparison
	// would then match against nothing.
	test("fails when the output came back without a scriptPubKey", async () => {
		const { fetchImpl } = respondWith({ vout: [{ value: 1 }] });
		const read = createEsploraTxOutReader({ url: "https://esplora.example" }, fetchImpl);

		await expect(read({ txid: TXID, vout: 0 })).rejects.toThrow();
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
