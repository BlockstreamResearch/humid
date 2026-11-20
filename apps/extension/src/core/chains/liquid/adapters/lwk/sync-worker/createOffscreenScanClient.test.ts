import { describe, expect, mock, test } from "bun:test";

const replies: (() => unknown)[] = [];

mock.module("webextension-polyfill", () => ({
	default: {
		runtime: {
			sendMessage: async () => {
				const reply = replies.shift();

				return reply?.();
			},
		},
	},
}));

(globalThis as { chrome?: unknown }).chrome = {
	offscreen: { createDocument: async () => {}, hasDocument: async () => true },
};

const { createOffscreenScanClient } = await import("./createOffscreenScanClient");

const notListening = () => {
	throw new Error("Could not establish connection. Receiving end does not exist.");
};

describe("a scan sent to the offscreen document", () => {
	test("waits for a document that is not listening yet", async () => {
		replies.push(notListening, notListening, () => ({ ok: true, op: "scan", updateBase64: null }));

		await expect(
			createOffscreenScanClient().scan({ chain: {} as never, descriptor: "" }),
		).resolves.toEqual({ updateBytes: null });
	});

	test("fails at once for any other error", async () => {
		replies.push(() => {
			throw new Error("Extension context invalidated.");
		});

		await expect(
			createOffscreenScanClient().scan({ chain: {} as never, descriptor: "" }),
		).rejects.toThrow("Extension context invalidated.");
	});
});
