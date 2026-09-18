import type {
	LiquidActivityEntry,
	LiquidAssetBalance,
	LiquidUtxoSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";

type BaseScanRequest = {
	chain: LiquidChainRecord;
	descriptor: string;
	id: number;
};

export type ScanRequest = BaseScanRequest & { op: "scan" };

export type ScanAndReadRequest = BaseScanRequest & { op: "scanAndRead" };

export type ReadActivityRequest = BaseScanRequest & {
	cursor: string | null;
	limit: number;
	op: "readActivity";
	rawAssetId: string;
};

export type SyncWorkerRequest = ReadActivityRequest | ScanRequest | ScanAndReadRequest;

export type SyncWorkerResponse =
	| { id: number; ok: true; op: "scan"; updateBytes: Uint8Array | null }
	| {
			assets: LiquidAssetBalance[];
			id: number;
			ok: true;
			op: "scanAndRead";
			utxos: LiquidUtxoSnapshot[];
	  }
	| {
			id: number;
			items: LiquidActivityEntry[];
			nextCursor: string | null;
			ok: true;
			op: "readActivity";
	  }
	| { id: number; ok: false; error: string };
