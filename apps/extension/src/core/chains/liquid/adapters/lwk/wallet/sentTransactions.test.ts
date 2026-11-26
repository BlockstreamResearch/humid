import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("../loadLwkWasm", () => ({
	loadLwkWasm: async () => ({
		Transaction: { fromString: (hex: string) => ({ free() {}, hex, txid: () => `id of ${hex}` }) },
	}),
}));

const { SentTransactions } = await import("./sentTransactions");

const labelled: [string, unknown][] = [];
const sentTransactions = new SentTransactions(async (txid, note) => {
	labelled.push([txid, note]);
});

const TXID = "ab".repeat(32);
const realFetch = globalThis.fetch;

let broadcastAnswer: () => string = () => TXID;

function answering(status: number, body: string) {
	globalThis.fetch = (async () => new Response(body, { status })) as unknown as typeof fetch;
}

function refusing(body: string) {
	broadcastAnswer = () => {
		throw new Error(`http://esplora/tx returned HTTP 400: ${body}`);
	};
}

function walletScanning(seen: string[]) {
	const applied: string[] = [];
	const account = {
		accountGroupId: "account-group:1",
		chain: { id: "bip122:regtest", settings: { backend: { url: "http://esplora/" } } },
		chainId: "bip122:regtest",
		descriptor: crypto.randomUUID(),
		implementation: {
			blockchainClient: {
				broadcastTx: async () => {
					const txid = broadcastAnswer();

					return { free() {}, toString: () => txid };
				},
			},
			wollet: {
				applyTransaction: ({ hex }: { hex: string }) => {
					applied.push(hex);

					return { free() {} };
				},
				transactions: () => seen.map((txid) => ({ free() {}, txid: () => txid })),
			},
		},
	};

	return { account: account as never, applied, seen };
}

afterEach(() => {
	globalThis.fetch = realFetch;
	broadcastAnswer = () => TXID;
});

describe("a broadcast the network refuses", () => {
	test("carries the node's reason", async () => {
		refusing(
			'sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met, 100 < 120"}',
		);

		await expect(sentTransactions.broadcast(walletScanning([]).account, "00")).rejects.toThrow(
			"The network refused the transaction: min relay fee not met, 100 < 120",
		);
	});

	test("carries the reason when the node words it as plain text", async () => {
		refusing("sendrawtransaction RPC error -27: Transaction already in block chain");

		await expect(sentTransactions.broadcast(walletScanning([]).account, "00")).rejects.toThrow(
			"The network refused the transaction: Transaction already in block chain",
		);
	});

	test("says when a coin it spends is already spent", async () => {
		refusing("sendrawtransaction RPC error -25: bad-txns-inputs-missingorspent");

		await expect(sentTransactions.broadcast(walletScanning([]).account, "00")).rejects.toThrow(
			"a coin it spends is already spent",
		);
	});

	test("but a backend that cannot be reached is not reported as a refusal", async () => {
		broadcastAnswer = () => {
			throw new Error("error sending request");
		};

		await expect(sentTransactions.broadcast(walletScanning([]).account, "00")).rejects.toThrow(
			"error sending request",
		);
	});
});

describe("a transaction the wallet sent", () => {
	test("counts against each later scan until a scan shows the transaction", async () => {
		const wallet = walletScanning([]);

		expect(await sentTransactions.broadcast(wallet.account, "beef")).toBe(TXID);

		await sentTransactions.applyTo(wallet.account);
		expect(wallet.applied).toEqual(["beef"]);

		wallet.seen.push(TXID);
		await sentTransactions.applyTo(wallet.account);
		wallet.seen.pop();
		await sentTransactions.applyTo(wallet.account);
		expect(wallet.applied).toEqual(["beef"]);
	});

	test("counts the same way when signed and handed back unsent", async () => {
		const wallet = walletScanning([]);

		await sentTransactions.remember(wallet.account, "cafe", {
			action: "Pay",
			holding: [],
			origin: "https://dapp.example",
		});
		await sentTransactions.applyTo(wallet.account);
		expect(wallet.applied).toEqual(["cafe"]);

		wallet.seen.push("id of cafe");
		await sentTransactions.applyTo(wallet.account);
		expect(wallet.applied).toEqual(["cafe"]);
	});

	test("is listed for its account until the chain knows the transaction, or until released", async () => {
		const wallet = walletScanning([]);
		const { chain } = wallet.account as { chain: never };
		const signedFor = {
			action: "Pay",
			holding: [{ amountSats: "1000", rawAssetId: "lbtc" }],
			origin: "https://dapp.example",
		};

		await sentTransactions.remember(wallet.account, "f00d", signedFor);
		await sentTransactions.remember(wallet.account, "d00d", signedFor);

		answering(404, "");
		expect(
			(await sentTransactions.signedFor(chain, "account-group:1")).map(({ txid }) => txid),
		).toEqual(["id of f00d", "id of d00d"]);
		expect(await sentTransactions.signedFor(chain, "account-group:2")).toEqual([]);

		sentTransactions.release("id of f00d");
		answering(200, "{}");
		expect(await sentTransactions.signedFor(chain, "account-group:1")).toEqual([]);
	});

	test("is labelled with the dapp and action that asked for it", async () => {
		const wallet = walletScanning([]);
		const note = { action: "Pay", origin: "https://dapp.example" };

		await sentTransactions.broadcast(wallet.account, "beef", note);
		await sentTransactions.broadcast(wallet.account, "feed");

		expect(labelled.filter(([txid]) => txid === TXID)).toEqual([[TXID, note]]);
	});
});
