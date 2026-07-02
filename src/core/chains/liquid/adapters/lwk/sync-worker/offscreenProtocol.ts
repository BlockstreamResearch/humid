import type {
	LiquidAssetBalance,
	LiquidFiatRate,
	LiquidWalletTx,
} from "../../../application/backends/LiquidWalletBackend";
import type { ScanInput } from "./createWorkerScanClient";

/** Discriminator so only the offscreen document (not other extension contexts) handles these. */
export const OFFSCREEN_SCAN_TARGET = "liquid-offscreen-scan";

export type OffscreenScanMessage = {
	input: ScanInput;
	op: "scan" | "scanAndRead";
	target: typeof OFFSCREEN_SCAN_TARGET;
};

export type OffscreenScanResponse =
	| {
			activity: LiquidWalletTx[];
			assets: LiquidAssetBalance[];
			ok: true;
			op: "scanAndRead";
			rate: LiquidFiatRate | null;
	  }
	| { error: string; ok: false }
	| { ok: true; op: "scan"; updateBase64: string | null };

export function isOffscreenScanMessage(value: unknown): value is OffscreenScanMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { target?: unknown }).target === OFFSCREEN_SCAN_TARGET
	);
}

// runtime messaging serializes as JSON (not structured clone), so the scan's Update bytes have
// to cross the SW↔offscreen boundary as base64 rather than a raw Uint8Array.
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
