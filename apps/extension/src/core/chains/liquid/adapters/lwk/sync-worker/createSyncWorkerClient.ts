import { createInlineScanClient } from "./createInlineScanClient";
import { createOffscreenScanClient, getChromeOffscreen } from "./createOffscreenScanClient";
import type { SyncWorkerClient } from "./createWorkerScanClient";

export type {
	ActivityPageResult,
	BroadcastInput,
	BroadcastResult,
	ReadActivityInput,
	ScanAndReadResult,
	ScanInput,
	ScanResult,
	SyncWorkerClient,
} from "./createWorkerScanClient";

/**
 * Picks how a background context runs the heavy LWK scan.
 *
 * LWK's Esplora client performs its async retry / rate-limit backoff via the DOM `window`
 * (`web_sys::window()`), which a dedicated `Worker` never has — so the scan must NOT run in a Worker
 * (doing so throws "Cannot access browser window for async sleep" the moment a sleep is hit). The
 * Chrome MV3 service worker has no `window` either, so it delegates to the offscreen document, which
 * owns a real `window` and scans inline. Any context that already has a `window` — the offscreen
 * document itself, a Firefox background page — scans inline directly.
 */
export function createSyncWorkerClient(): SyncWorkerClient {
	if (typeof window === "undefined" && getChromeOffscreen()) return createOffscreenScanClient();

	return createInlineScanClient();
}

let sharedClient: SyncWorkerClient | null = null;

/** The shared sync client for the background — created lazily on first scan. */
export function getSyncWorkerClient(): SyncWorkerClient {
	sharedClient ??= createSyncWorkerClient();

	return sharedClient;
}
