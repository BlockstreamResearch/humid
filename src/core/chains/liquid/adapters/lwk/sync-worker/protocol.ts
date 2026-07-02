import type {
	LiquidActivityEntry,
	LiquidAssetBalance,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";

type BaseScanRequest = {
	chain: LiquidChainRecord;
	descriptor: string;
	id: number;
};

/** A one-off full scan on a fresh wollet, returning the serialized Update to apply. */
export type ScanRequest = BaseScanRequest & { op: "scan" };

/** An incremental scan on the worker's cached wollet, returning the read data directly. */
export type ScanAndReadRequest = BaseScanRequest & { op: "scanAndRead" };

/** A pure read of one asset's activity page from the worker's cached wollet (no scan). */
export type ReadActivityRequest = BaseScanRequest & {
	cursor: string | null;
	limit: number;
	op: "readActivity";
	rawAssetId: string;
};

/**
 * A request for the sync worker. Only the public descriptor crosses the boundary —
 * private keys never leave the background.
 */
export type SyncWorkerRequest = ReadActivityRequest | ScanRequest | ScanAndReadRequest;

export type SyncWorkerResponse =
	| { id: number; ok: true; op: "scan"; updateBytes: Uint8Array | null }
	| {
			assets: LiquidAssetBalance[];
			id: number;
			ok: true;
			op: "scanAndRead";
	  }
	| {
			id: number;
			items: LiquidActivityEntry[];
			nextCursor: string | null;
			ok: true;
			op: "readActivity";
	  }
	| { id: number; ok: false; error: string };
