import type {
	LiquidActivityEntry,
	LiquidAssetBalance,
	LiquidUtxoSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { ReadActivityInput, ScanInput } from "./createWorkerScanClient";

export const OFFSCREEN_SCAN_TARGET = "liquid-offscreen-scan";

export type OffscreenScanMessage =
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
	| { ok: true; op: "scan"; updateBase64: string | null };

export function isOffscreenScanMessage(value: unknown): value is OffscreenScanMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { target?: unknown }).target === OFFSCREEN_SCAN_TARGET
	);
}
