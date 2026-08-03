import { describe, expect, test } from "bun:test";

import { formatTimeAgo } from "./formatters";

// Expectations are taken from the documented contract of each function, not from
// reading its body: `formatTimeAgo` states that sub-minute gaps read as "just now"
// and that anything in between rounds down but never to "0m".
describe("formatTimeAgo", () => {
	const now = 1_700_000_000_000;
	const ago = (seconds: number) => formatTimeAgo(now - seconds * 1000, now);

	test("reads a sub-minute gap as 'just now'", () => {
		expect(ago(0)).toBe("just now");
		expect(ago(44)).toBe("just now");
	});

	test("never rounds down to '0m'", () => {
		expect(ago(45)).toBe("1m ago");
		expect(ago(59)).toBe("1m ago");
	});

	test("rounds down within each unit", () => {
		expect(ago(60)).toBe("1m ago");
		expect(ago(119)).toBe("1m ago");
		expect(ago(59 * 60)).toBe("59m ago");
	});

	test("steps up to hours and days", () => {
		expect(ago(60 * 60)).toBe("1h ago");
		expect(ago(23 * 60 * 60)).toBe("23h ago");
		expect(ago(24 * 60 * 60)).toBe("1d ago");
		expect(ago(72 * 60 * 60)).toBe("3d ago");
	});

	test("treats a future timestamp as 'just now' rather than going negative", () => {
		expect(formatTimeAgo(now + 60_000, now)).toBe("just now");
	});
});
