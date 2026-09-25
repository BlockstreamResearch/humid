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

export function createSyncWorkerClient(): SyncWorkerClient {
	if (typeof window === "undefined" && getChromeOffscreen()) return createOffscreenScanClient();

	return createInlineScanClient();
}

let sharedClient: SyncWorkerClient | null = null;

export function getSyncWorkerClient(): SyncWorkerClient {
	sharedClient ??= createSyncWorkerClient();

	return sharedClient;
}
