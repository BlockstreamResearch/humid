/**
 * Preserve a structured RPC error across the message boundary. A thrown `WalletRpcError` carries a
 * numeric `code` and a `data.reason` the dapp branches on (e.g. skip retrying a user rejection);
 * collapsing it to `error.message` — as this used to — dropped both, leaving the dapp a bare string
 * it could not classify. Kept structural (no wallet-rpc import) so any error with code/data survives.
 */
export function serializeError(error: unknown, depth = 0): unknown {
	if (error instanceof Error) {
		const structured = error as Error & { code?: unknown; data?: unknown };

		return {
			message: error.message,
			...(typeof structured.code === "number" ? { code: structured.code } : {}),
			...(structured.data === undefined ? {} : { data: structured.data }),
			// The cause is where the real reason lives. Handlers wrap a failure in a stable
			// wallet error and attach what actually went wrong underneath — insufficient funds, a
			// rejected broadcast, an address the chain library would not parse. Dropping it here
			// left the wrapper's own sentence as the whole story, which is the opaque outcome the
			// wrapping was written to avoid. Bounded, because a cause chain can be circular.
			...(structured.cause === undefined || depth >= MAX_CAUSE_DEPTH
				? {}
				: { cause: serializeError(structured.cause, depth + 1) }),
		};
	}

	return error;
}

const MAX_CAUSE_DEPTH = 4;
