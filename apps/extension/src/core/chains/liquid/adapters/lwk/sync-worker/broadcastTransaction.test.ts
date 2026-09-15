import { describe, expect, mock, test } from "bun:test";

/**
 * How a finished transaction reaches the network, beside the PSET route rather than instead of
 * it.
 *
 * The manifest path does not produce a PSET: the contract module blinds, signs and finalises
 * internally and hands back consensus bytes. Those bytes still have to leave the service worker
 * to go out, because LWK's Esplora client does its retry and backoff through a `window` the
 * service worker does not have — so this checks the one thing a unit test can check about that
 * crossing: that the request is addressed to the offscreen document under its own operation,
 * carries the transaction, and that the answer is read back as the network's own txid.
 */
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

// The offscreen document is a Chrome API this context does not have, and the client refuses
// without it before it sends anything. Stubbed as already existing, because what is under test
// is the message and the answer rather than the document's creation.
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

	// The target is what stops another extension context answering this. A message without it is
	// not one the offscreen document handles, which is what the guard is for.
	test("sends a message the offscreen document recognises as its own", async () => {
		sent.length = 0;
		reply = { ok: true, op: "broadcastTransaction", txid: "a".repeat(64) };

		await createOffscreenScanClient().broadcastTransaction({ chain, txHex: "deadbeef" });

		expect(isOffscreenScanMessage(sent[0])).toBe(true);
	});

	// Answering a broadcast with a scan's answer would hand back a txid nothing sent. The op is
	// checked rather than the shape, because the two responses carry the same field names.
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

	// The PSET route is unchanged and still goes out under its own operation. Both exist: the
	// ordinary send path produces a PSET and the contract path does not.
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
