import { describe, expect, mock, test } from "bun:test";

const sent: unknown[] = [];
let reply: unknown = { ok: true, op: "broadcastTransaction", txid: "a".repeat(64) };

mock.module("webextension-polyfill", () => ({
	default: {
		runtime: {
			sendMessage: (message: unknown) => {
				sent.push(message);

				return Promise.resolve(reply);
			},
		},
	},
}));

(globalThis as { chrome?: unknown }).chrome = {
	offscreen: {
		createDocument: () => Promise.resolve(),
		hasDocument: () => Promise.resolve(true),
	},
};

const { createOffscreenScanClient } = await import("./createOffscreenScanClient");
const { isOffscreenScanMessage, OFFSCREEN_SCAN_TARGET } = await import("./offscreenProtocol");

const chain = { id: "liquid:testnet" } as never;

describe("broadcasting a signed transaction", () => {
	test("addresses the offscreen document, under its own operation, carrying the bytes", async () => {
		sent.length = 0;
		reply = { ok: true, op: "broadcastTransaction", txid: "a".repeat(64) };

		const result = await createOffscreenScanClient().broadcastTransaction({
			chain,
			txHex: "deadbeef",
		});

		expect(result).toEqual({ txid: "a".repeat(64) });
		expect(sent).toEqual([
			{
				input: { chain, txHex: "deadbeef" },
				op: "broadcastTransaction",
				target: OFFSCREEN_SCAN_TARGET,
			},
		]);
	});

	test("sends a message the offscreen document recognises as its own", async () => {
		sent.length = 0;
		reply = { ok: true, op: "broadcastTransaction", txid: "a".repeat(64) };

		await createOffscreenScanClient().broadcastTransaction({ chain, txHex: "deadbeef" });

		expect(isOffscreenScanMessage(sent[0])).toBe(true);
	});

	test("refuses an answer that is not this operation's", async () => {
		reply = { ok: true, op: "broadcast", txid: "b".repeat(64) };

		await expect(
			createOffscreenScanClient().broadcastTransaction({ chain, txHex: "deadbeef" }),
		).rejects.toThrow("Unexpected offscreen scan response");
	});

	test("carries the failure through rather than answering with a txid", async () => {
		reply = { error: "the node rejected it", ok: false };

		await expect(
			createOffscreenScanClient().broadcastTransaction({ chain, txHex: "deadbeef" }),
		).rejects.toThrow("the node rejected it");
	});

	test("leaves the PSET route alone", async () => {
		sent.length = 0;
		reply = { ok: true, op: "broadcast", txid: "c".repeat(64) };

		const result = await createOffscreenScanClient().broadcast({ chain, psetBase64: "cHNldA==" });

		expect(result).toEqual({ txid: "c".repeat(64) });
		expect(sent).toEqual([
			{
				input: { chain, psetBase64: "cHNldA==" },
				op: "broadcast",
				target: OFFSCREEN_SCAN_TARGET,
			},
		]);
	});
});

describe("the dedicated worker, which cannot broadcast either kind", () => {
	test("refuses rather than pretending, naming what can", async () => {
		const { createWorkerScanClient } = await import("./createWorkerScanClient");

		await expect(
			createWorkerScanClient().broadcastTransaction({ chain, txHex: "deadbeef" }),
		).rejects.toThrow("offscreen or inline");
	});
});
