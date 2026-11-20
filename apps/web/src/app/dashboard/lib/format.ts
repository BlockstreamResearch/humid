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

export function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return formatResult(error);
}

export function summarizeResult(value: unknown): string {
	const text = formatResult(value);
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

export function truncateId(id: string | undefined): string {
	if (!id) return "";
	return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function parseJsonInput(value: string): unknown {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return JSON.parse(trimmed);
}

export function trimmedOrUndefined(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}
