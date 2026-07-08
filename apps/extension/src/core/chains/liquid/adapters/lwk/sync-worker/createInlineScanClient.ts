import type { SyncWorkerClient } from "./createWorkerScanClient";
import {
	broadcastPset as runBroadcastPset,
	readActivity as runReadActivity,
	scanAndRead as runScanAndRead,
	scanFresh as runScanFresh,
} from "./liquidScanCore";

/**
 * Runs the LWK scan INLINE on the calling thread. Used wherever the caller already owns a real DOM
 * `window` — the Chrome offscreen document, or a Firefox background page — because LWK's Esplora
 * client does its async retry / rate-limit backoff via `window` (`web_sys::window()`), which a
 * dedicated `Worker` (and the MV3 service worker) does not have. Blocking the calling thread is fine
 * here: these are dedicated, invisible background contexts, never the popup UI.
 */
export function createInlineScanClient(): SyncWorkerClient {
	let seq = 0;

	return {
		async broadcast(input) {
			return { txid: await runBroadcastPset({ ...input, id: (seq += 1) }) };
		},
		async readActivity(input) {
			return runReadActivity({ ...input, id: (seq += 1) });
		},
		async scan(input) {
			return { updateBytes: await runScanFresh({ ...input, id: (seq += 1) }) };
		},
		async scanAndRead(input) {
			return runScanAndRead({ ...input, id: (seq += 1) });
		},
	};
}
