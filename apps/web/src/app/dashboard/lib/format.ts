/** Pretty-print an RPC result: JSON strings are re-indented, everything else is stringified. */
export function formatResult(value: unknown): string {
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}

	return JSON.stringify(value, null, 2);
}

/** Reduce an error to its message, falling back to a formatted dump for non-Error rejections. */
export function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return formatResult(error);
}

/** Keep the auto-load report compact — the per-method cards show the full payload. */
export function summarizeResult(value: unknown): string {
	const text = formatResult(value);
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** Shorten a wallet address for the connected indicator: first 6 + last 4, e.g. tb1qab…7890. */
export function truncateAddress(address: string | undefined): string {
	if (!address) return "";
	return address.length <= 10 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Parse a JSON text field, treating blank input as `undefined`; throws on invalid JSON. */
export function parseJsonInput(value: string): unknown {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return JSON.parse(trimmed);
}

/** Trim a text-field value, collapsing an all-whitespace entry to `undefined`. */
export function trimmedOrUndefined(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}
