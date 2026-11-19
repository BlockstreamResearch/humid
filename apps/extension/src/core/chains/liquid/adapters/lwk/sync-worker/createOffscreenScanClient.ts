import browser from "webextension-polyfill";

import { sleep } from "@/helpers/promise";

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

export function getChromeOffscreen(): ChromeOffscreenApi | undefined {
	return (globalThis as { chrome?: { offscreen?: ChromeOffscreenApi } }).chrome?.offscreen;
}

const OFFSCREEN_DOCUMENT_URL = "src/offscreen.html";
const NOT_LISTENING = "Receiving end does not exist";
const LISTENER_WAIT_ATTEMPTS = 40;
const LISTENER_WAIT_MS = 50;

let creatingDocument: Promise<void> | null = null;

async function ensureOffscreenDocument(offscreen: ChromeOffscreenApi): Promise<void> {
	if (await offscreen.hasDocument()) return;

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

type OffscreenRequestPayload =
	| { input: ScanInput; op: "scan" | "scanAndRead" }
	| { input: ReadActivityInput; op: "readActivity" };

async function requestScan(payload: OffscreenRequestPayload): Promise<OffscreenScanResponse> {
	const offscreen = getChromeOffscreen();

	if (!offscreen) throw new Error("chrome.offscreen is unavailable in this context.");

	await ensureOffscreenDocument(offscreen);

	for (let attempt = 1; ; attempt += 1) {
		try {
			// oxlint-disable-next-line no-await-in-loop
			return (await browser.runtime.sendMessage({
				...payload,
				target: OFFSCREEN_SCAN_TARGET,
			})) as OffscreenScanResponse;
		} catch (error) {
			// A document just created may not be listening yet.
			if (attempt >= LISTENER_WAIT_ATTEMPTS || !String(error).includes(NOT_LISTENING)) throw error;

			// oxlint-disable-next-line no-await-in-loop
			await sleep(LISTENER_WAIT_MS);
		}
	}
}

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
