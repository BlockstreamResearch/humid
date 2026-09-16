import { useState } from "react";

import { formatError, formatResult } from "./format";

export type CallResult = { ok: boolean; text: string };

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
