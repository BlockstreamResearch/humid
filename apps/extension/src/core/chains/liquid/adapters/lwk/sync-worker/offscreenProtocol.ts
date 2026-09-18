import type {
	LiquidActivityEntry,
	LiquidAssetBalance,
	LiquidUtxoSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type {
	BroadcastInput,
	BroadcastTxInput,
	ReadActivityInput,
	ScanInput,
} from "./createWorkerScanClient";

export const OFFSCREEN_SCAN_TARGET = "liquid-offscreen-scan";

export type OffscreenScanMessage =
	| {
			input: BroadcastInput;
			op: "broadcast";
			target: typeof OFFSCREEN_SCAN_TARGET;
	  }
	| {
			input: BroadcastTxInput;
			op: "broadcastTransaction";
			target: typeof OFFSCREEN_SCAN_TARGET;
	  }
	| {
			input: ScanInput;
			op: "scan" | "scanAndRead";
			target: typeof OFFSCREEN_SCAN_TARGET;
	  }
	| {
			input: ReadActivityInput;
			op: "readActivity";
			target: typeof OFFSCREEN_SCAN_TARGET;
	  };

export type OffscreenScanResponse =
	| {
			assets: LiquidAssetBalance[];
			ok: true;
			op: "scanAndRead";
			utxos: LiquidUtxoSnapshot[];
	  }
	| { error: string; ok: false }
	| {
			items: LiquidActivityEntry[];
			nextCursor: string | null;
			ok: true;
			op: "readActivity";
	  }
	| { ok: true; op: "broadcast"; txid: string }
	| { ok: true; op: "broadcastTransaction"; txid: string }
	| { ok: true; op: "scan"; updateBase64: string | null };

export function isOffscreenScanMessage(value: unknown): value is OffscreenScanMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { target?: unknown }).target === OFFSCREEN_SCAN_TARGET
	);
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;

	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}

	return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}
