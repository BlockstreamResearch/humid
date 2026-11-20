import type { SyncWorkerClient } from "./createWorkerScanClient";
import {
	readActivity as runReadActivity,
	scanAndRead as runScanAndRead,
	scanFresh as runScanFresh,
} from "./liquidScanCore";

export function createInlineScanClient(): SyncWorkerClient {
	let seq = 0;

	return {
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
