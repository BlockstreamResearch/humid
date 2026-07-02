import browser from "webextension-polyfill";

import {
	createWorkerScanClient,
	type SyncWorkerClient,
} from "@/core/chains/liquid/adapters/lwk/sync-worker/createWorkerScanClient";
import {
	bytesToBase64,
	isOffscreenScanMessage,
	type OffscreenScanResponse,
} from "@/core/chains/liquid/adapters/lwk/sync-worker/offscreenProtocol";

// This hidden document exists solely to run the heavy Liquid scan in a Worker, off the MV3
// service worker thread (which can't spawn Workers). The background posts scan requests here and
// awaits the result; the Worker — and its warm wasm — lives as long as this document does.
let client: SyncWorkerClient | null = null;

function getScanClient(): SyncWorkerClient {
	client ??= createWorkerScanClient();

	return client;
}

browser.runtime.onMessage.addListener((message) => {
	if (!isOffscreenScanMessage(message)) return undefined;

	return (async (): Promise<OffscreenScanResponse> => {
		try {
			if (message.op === "scan") {
				const { updateBytes } = await getScanClient().scan(message.input);

				return {
					ok: true,
					op: "scan",
					updateBase64: updateBytes ? bytesToBase64(updateBytes) : null,
				};
			}

			if (message.op === "readActivity") {
				const page = await getScanClient().readActivity(message.input);

				return { items: page.items, nextCursor: page.nextCursor, ok: true, op: "readActivity" };
			}

			const result = await getScanClient().scanAndRead(message.input);

			return { ...result, ok: true, op: "scanAndRead" };
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error), ok: false };
		}
	})();
});
