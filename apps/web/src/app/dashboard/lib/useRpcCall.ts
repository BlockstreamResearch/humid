import { useState } from "react";

import { formatError, formatResult } from "./format";

export type CallResult = { ok: boolean; text: string };

/**
 * Track a single RPC call's pending / result state for a card. Purely a UI concern — the actual call
 * is a `context.wallet.*` (or connection) invocation passed in as `job`; this only formats and stores
 * its outcome for the {@link ResultPanel}.
 */
export function useRpcCall() {
	const [result, setResult] = useState<CallResult | null>(null);
	const [pending, setPending] = useState(false);

	const call = async (job: () => Promise<unknown>) => {
		setPending(true);
		try {
			const value = await job();
			setResult({ ok: true, text: formatResult(value) });
		} catch (error) {
			setResult({ ok: false, text: formatError(error) });
		} finally {
			setPending(false);
		}
	};

	return { call, pending, result };
}
