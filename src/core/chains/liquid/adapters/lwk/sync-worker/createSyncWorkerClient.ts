import { createOffscreenScanClient, getChromeOffscreen } from "./createOffscreenScanClient";
import { createWorkerScanClient, type SyncWorkerClient } from "./createWorkerScanClient";
import { scanAndRead as runScanAndRead, scanFresh as runScanFresh } from "./liquidScanCore";

export type {
	ScanAndReadResult,
	ScanInput,
	ScanResult,
	SyncWorkerClient,
} from "./createWorkerScanClient";

/**
 * Picks how the background runs the heavy LWK scan for its context:
 * - a dedicated `Worker` where one exists (a Firefox background page, or our offscreen document);
 * - an offscreen document on Chrome, whose MV3 service worker can't spawn a `Worker` itself;
 * - inline on the current thread as a last resort.
 */
export function createSyncWorkerClient(): SyncWorkerClient {
	if (typeof Worker !== "undefined") return createWorkerScanClient();
	if (getChromeOffscreen()) return createOffscreenScanClient();

	return createInlineScanClient();
}

/** Fallback where neither a `Worker` nor an offscreen document exists: scan on the current thread. */
function createInlineScanClient(): SyncWorkerClient {
	console.warn(
		"[liquid-sync] No Worker or offscreen document available — running scans inline on this thread",
	);

	let seq = 0;

	return {
		async scan(input) {
			return { updateBytes: await runScanFresh({ ...input, id: (seq += 1) }) };
		},
		async scanAndRead(input) {
			return runScanAndRead({ ...input, id: (seq += 1) });
		},
	};
}

let sharedClient: SyncWorkerClient | null = null;

/** The shared sync client for the background — created lazily on first scan. */
export function getSyncWorkerClient(): SyncWorkerClient {
	sharedClient ??= createSyncWorkerClient();

	return sharedClient;
}
