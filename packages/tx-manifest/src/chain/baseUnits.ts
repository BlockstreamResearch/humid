export const MAX_BASE_UNITS = 2n ** 63n - 1n;

const BASE_UNITS = /^(?:0|[1-9]\d*)$/;

export function baseUnits(text: string): bigint | undefined {
	if (!BASE_UNITS.test(text)) {
		return undefined;
	}

	const value = BigInt(text);

	return value > MAX_BASE_UNITS ? undefined : value;
}
