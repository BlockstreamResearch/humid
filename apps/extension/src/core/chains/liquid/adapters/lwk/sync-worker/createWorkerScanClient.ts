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

export type BroadcastInput = { chain: ScanInput["chain"]; psetBase64: string };

export type BroadcastTxInput = { chain: ScanInput["chain"]; txHex: string };
export type BroadcastResult = { txid: string };

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

export type SyncWorkerClient = {
	broadcast: (input: BroadcastInput) => Promise<BroadcastResult>;
	broadcastTransaction: (input: BroadcastTxInput) => Promise<BroadcastResult>;
	readActivity: (input: ReadActivityInput) => Promise<ActivityPageResult>;
	scan: (input: ScanInput) => Promise<ScanResult>;
	scanAndRead: (input: ScanInput) => Promise<ScanAndReadResult>;
};

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
		broadcastTransaction() {
			return Promise.reject(
				new Error("The dedicated worker cannot broadcast; use the offscreen or inline client."),
			);
		},
		broadcast() {
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
