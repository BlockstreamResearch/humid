import browser from "webextension-polyfill";

import { createInlineScanClient } from "@/core/chains/liquid/adapters/lwk/sync-worker/createInlineScanClient";
import type { SyncWorkerClient } from "@/core/chains/liquid/adapters/lwk/sync-worker/createWorkerScanClient";
import {
	bytesToBase64,
	isOffscreenScanMessage,
	type OffscreenScanResponse,
} from "@/core/chains/liquid/adapters/lwk/sync-worker/offscreenProtocol";

// This hidden document runs the heavy Liquid scan on ITS OWN main thread. It exists because the MV3
// service worker has no DOM `window`, and LWK's Esplora client needs one for its async retry/sleep —
// a dedicated Worker has no `window` either, so the scan runs INLINE here, not in a Worker. The warm
// wasm lives as long as this document does. The background posts scan requests here and awaits them.
let client: SyncWorkerClient | null = null;

function getScanClient(): SyncWorkerClient {
	client ??= createInlineScanClient();

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
