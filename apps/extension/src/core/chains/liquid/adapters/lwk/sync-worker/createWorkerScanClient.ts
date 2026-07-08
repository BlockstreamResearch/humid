import type {
	LiquidActivityEntry,
	LiquidAssetBalance,
	LiquidUtxoSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { SyncWorkerRequest, SyncWorkerResponse } from "./protocol";

export type ScanInput = { chain: SyncWorkerRequest["chain"]; descriptor: string };
export type ScanResult = { updateBytes: Uint8Array | null };
export type ScanAndReadResult = {
	assets: LiquidAssetBalance[];
	utxos: LiquidUtxoSnapshot[];
};

/** Inputs to broadcast an already-signed, finalized PSET (base64) built in the service worker. */
export type BroadcastInput = { chain: ScanInput["chain"]; psetBase64: string };
export type BroadcastResult = { txid: string };

/** Inputs to read one asset's activity page from the worker's cached wollet. */
export type ReadActivityInput = ScanInput & {
	cursor: string | null;
	limit: number;
	rawAssetId: string;
};

export type ActivityPageResult = {
	items: LiquidActivityEntry[];
	nextCursor: string | null;
};

type SuccessResponse = Extract<SyncWorkerResponse, { ok: true }>;

/** A promise-per-request handle to a scan backend (a dedicated worker, offscreen, or inline). */
export type SyncWorkerClient = {
	broadcast: (input: BroadcastInput) => Promise<BroadcastResult>;
	readActivity: (input: ReadActivityInput) => Promise<ActivityPageResult>;
	scan: (input: ScanInput) => Promise<ScanResult>;
	scanAndRead: (input: ScanInput) => Promise<ScanAndReadResult>;
};

/**
 * Client backed by a dedicated `Worker` running the heavy LWK scans. Usable wherever `Worker`
 * exists — a Firefox background page, or our Chrome offscreen document — but not directly in an
 * MV3 service worker (which can't spawn workers; that context messages the offscreen document).
 */
export function createWorkerScanClient(): SyncWorkerClient {
	const worker = new Worker(new URL("./liquidScan.worker.ts", import.meta.url), {
		type: "module",
	});

	const pending = new Map<
		number,
		{ reject: (error: Error) => void; resolve: (response: SuccessResponse) => void }
	>();
	let nextId = 0;

	worker.addEventListener("message", (event: MessageEvent<SyncWorkerResponse>) => {
		const response = event.data;
		const entry = pending.get(response.id);

		if (!entry) return;

		pending.delete(response.id);

		if (response.ok) {
			entry.resolve(response);
		} else {
			entry.reject(new Error(response.error));
		}
	});

	worker.addEventListener("error", (event) => {
		// A worker-level failure can't be tied to one request, so fail every in-flight scan.
		console.error(
			"[liquid-sync] sync worker crashed",
			event.message,
			`${event.filename}:${event.lineno}`,
		);

		const error = new Error(event.message || "Sync worker crashed.");

		for (const entry of pending.values()) entry.reject(error);

		pending.clear();
	});

	function request(input: Omit<SyncWorkerRequest, "id">): Promise<SuccessResponse> {
		nextId += 1;
		const id = nextId;

		return new Promise<SuccessResponse>((resolve, reject) => {
			pending.set(id, { reject, resolve });
			worker.postMessage({ ...input, id });
		});
	}

	return {
		broadcast() {
			// LWK can't run in a dedicated Worker (Esplora's async retry/sleep needs a `window` a
			// Worker lacks), so this path never broadcasts — the offscreen/inline clients do. Present
			// only to satisfy SyncWorkerClient; this worker client is unused since the scan moved off it.
			return Promise.reject(
				new Error(
					"The dedicated sync worker cannot broadcast; use the offscreen or inline client.",
				),
			);
		},
		async readActivity(input) {
			const response = await request({ op: "readActivity", ...input });

			if (response.op !== "readActivity") throw new Error("Unexpected sync worker response.");

			return { items: response.items, nextCursor: response.nextCursor };
		},
		async scan(input) {
			const response = await request({ op: "scan", ...input });

			if (response.op !== "scan") throw new Error("Unexpected sync worker response.");

			return { updateBytes: response.updateBytes };
		},
		async scanAndRead(input) {
			const response = await request({ op: "scanAndRead", ...input });

			if (response.op !== "scanAndRead") throw new Error("Unexpected sync worker response.");

			return { assets: response.assets, utxos: response.utxos };
		},
	};
}
