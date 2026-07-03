import { readActivity, scanAndRead, scanFresh } from "./liquidScanCore";
import type { SyncWorkerRequest, SyncWorkerResponse } from "./protocol";

// Minimal dedicated-worker surface. Declaring it locally avoids pulling the `webworker`
// TS lib, which clashes with the project's `DOM` lib on globals like `self`.
type WorkerScope = {
	addEventListener: (
		type: "message",
		listener: (event: MessageEvent<SyncWorkerRequest>) => void,
	) => void;
	postMessage: (message: SyncWorkerResponse) => void;
};

const ctx = self as unknown as WorkerScope;

// Thin message loop around the shared scan core. Used where dedicated Workers exist (e.g. a
// Firefox background page); MV3 service workers can't spawn Workers and scan inline instead.
async function handle(request: SyncWorkerRequest): Promise<void> {
	try {
		if (request.op === "scan") {
			ctx.postMessage({
				id: request.id,
				ok: true,
				op: "scan",
				updateBytes: await scanFresh(request),
			});
		} else if (request.op === "readActivity") {
			const page = readActivity(request);

			ctx.postMessage({
				id: request.id,
				items: page.items,
				nextCursor: page.nextCursor,
				ok: true,
				op: "readActivity",
			});
		} else {
			ctx.postMessage({
				id: request.id,
				ok: true,
				op: "scanAndRead",
				...(await scanAndRead(request)),
			});
		}
	} catch (error) {
		console.error("[liquid-sync] worker error", { id: request.id }, error);

		ctx.postMessage({
			id: request.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

ctx.addEventListener("message", (event) => {
	void handle(event.data);
});
