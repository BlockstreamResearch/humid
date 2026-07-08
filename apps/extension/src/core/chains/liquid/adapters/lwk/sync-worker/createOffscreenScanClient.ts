import browser from "webextension-polyfill";

import type { ReadActivityInput, ScanInput, SyncWorkerClient } from "./createWorkerScanClient";
import {
	base64ToBytes,
	OFFSCREEN_SCAN_TARGET,
	type OffscreenScanResponse,
} from "./offscreenProtocol";

type ChromeOffscreenApi = {
	createDocument: (parameters: {
		justification: string;
		reasons: string[];
		url: string;
	}) => Promise<void>;
	hasDocument: () => Promise<boolean>;
};

/** The Chrome-only offscreen API if this context exposes it (undefined on Firefox / old Chrome). */
export function getChromeOffscreen(): ChromeOffscreenApi | undefined {
	return (globalThis as { chrome?: { offscreen?: ChromeOffscreenApi } }).chrome?.offscreen;
}

const OFFSCREEN_DOCUMENT_URL = "src/offscreen.html";

let creatingDocument: Promise<void> | null = null;

/** Ensure the single offscreen document exists, de-duping concurrent creation attempts. */
async function ensureOffscreenDocument(offscreen: ChromeOffscreenApi): Promise<void> {
	if (await offscreen.hasDocument()) return;

	// createDocument rejects if a document already exists or is mid-creation, so share one promise.
	creatingDocument ??= offscreen
		.createDocument({
			justification:
				"Run the Liquid wallet blockchain scan (WASM) in a worker, off the service worker thread.",
			reasons: ["WORKERS"],
			url: OFFSCREEN_DOCUMENT_URL,
		})
		.finally(() => {
			creatingDocument = null;
		});

	await creatingDocument;
}

/** A scan/read request payload for the offscreen document (the target is added on send). */
type OffscreenRequestPayload =
	| { input: ScanInput; op: "scan" | "scanAndRead" }
	| { input: ReadActivityInput; op: "readActivity" };

async function requestScan(payload: OffscreenRequestPayload): Promise<OffscreenScanResponse> {
	const offscreen = getChromeOffscreen();

	if (!offscreen) throw new Error("chrome.offscreen is unavailable in this context.");

	await ensureOffscreenDocument(offscreen);

	return (await browser.runtime.sendMessage({
		...payload,
		target: OFFSCREEN_SCAN_TARGET,
	})) as OffscreenScanResponse;
}

/**
 * Client used by Chrome's MV3 service worker: delegate scans to the offscreen document (which can
 * spawn a worker) over runtime messaging and await the result. The heavy scan runs fully off the
 * service worker thread — the whole reason this path exists.
 */
export function createOffscreenScanClient(): SyncWorkerClient {
	return {
		async readActivity(input) {
			const response = await requestScan({ input, op: "readActivity" });

			if (!response.ok) throw new Error(response.error);
			if (response.op !== "readActivity") throw new Error("Unexpected offscreen scan response.");

			return { items: response.items, nextCursor: response.nextCursor };
		},
		async scan(input) {
			const response = await requestScan({ input, op: "scan" });

			if (!response.ok) throw new Error(response.error);
			if (response.op !== "scan") throw new Error("Unexpected offscreen scan response.");

			return {
				updateBytes: response.updateBase64 ? base64ToBytes(response.updateBase64) : null,
			};
		},
		async scanAndRead(input) {
			const response = await requestScan({ input, op: "scanAndRead" });

			if (!response.ok) throw new Error(response.error);
			if (response.op !== "scanAndRead") throw new Error("Unexpected offscreen scan response.");

			return { assets: response.assets, utxos: response.utxos };
		},
	};
}
