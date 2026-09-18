import type { SyncWorkerClient } from "./createWorkerScanClient";
import {
	broadcastPset as runBroadcastPset,
	broadcastTransaction as runBroadcastTransaction,
	readActivity as runReadActivity,
	scanAndRead as runScanAndRead,
	scanFresh as runScanFresh,
} from "./liquidScanCore";

export function createInlineScanClient(): SyncWorkerClient {
	let seq = 0;

	return {
		async broadcast(input) {
			return { txid: await runBroadcastPset({ ...input, id: (seq += 1) }) };
		},
		async broadcastTransaction(input) {
			return { txid: await runBroadcastTransaction({ ...input, id: (seq += 1) }) };
		},
		async readActivity(input) {
			return runReadActivity({ ...input, id: (seq += 1) });
		},
		async scan(input) {
			return { updateBytes: await runScanFresh({ ...input, id: (seq += 1) }) };
		},
		async scanAndRead(input) {
			return runScanAndRead({ ...input, id: (seq += 1) });
		},
	};
}
