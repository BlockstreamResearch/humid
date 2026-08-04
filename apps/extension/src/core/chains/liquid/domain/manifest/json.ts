/**
 * The three shape tests every part of the runtime needs on a document it did not write.
 *
 * A manifest arrives as parsed JSON and nothing about its interior is guaranteed, so
 * reading it is a sequence of "is this the shape I think it is" questions. These were
 * redefined in four files before the runtime core existed; they live here once.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
