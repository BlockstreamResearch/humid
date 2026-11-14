export const MAX_BASE_UNITS = 2n ** 63n - 1n;

const BASE_UNITS = /^(?:0|[1-9]\d*)$/;

export function integerOf(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^-?\d+$/.test(value.trim())
		? BigInt(value.trim())
		: undefined;
}

export function baseUnits(text: string): bigint | undefined {
	if (!BASE_UNITS.test(text)) {
		return undefined;
	}

	const value = BigInt(text);

	return value > MAX_BASE_UNITS ? undefined : value;
}
