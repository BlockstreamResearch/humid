// Shared Liquid formatting helpers. Amounts stay bigint base units through the model and math; the
// human string is produced only here, at the render edge.

/** The identity URI the dapp personalizes itself with (SLIP-0013 "signed in as"). */
export const DEFAULT_IDENTITY_URI = "ssh://humid@localhost";

/** A stable hex challenge for the "prove identity" flow (mirrors the debug card default). */
export const DEFAULT_IDENTITY_CHALLENGE =
	"4c69717569642057616c6c6574205250432050726f66696c65206964656e74697479206368616c6c656e6765";

/** A stable hex KDF info for the shared-secret derivation (mirrors the debug card default). */
export const DEFAULT_KDF_INFO = "68756d69642d7765622d74657374";

/** Insert thousands separators into a run of digits: "1234567" → "1,234,567". */
function groupThousands(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format an L-BTC base-unit amount (8 decimals by default) for display: grouped whole part, trailing
 * zeros trimmed, no unit. `123456789n` → "1.23456789", `100000000n` → "1", `0n` → "0".
 */
export function formatLbtc(base: bigint, decimals = 8): string {
	const negative = base < 0n;
	const abs = negative ? -base : base;
	const divisor = 10n ** BigInt(decimals);
	const whole = groupThousands((abs / divisor).toString());
	const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
	const body = fraction ? `${whole}.${fraction}` : whole;
	return negative ? `-${body}` : body;
}

/**
 * Parse a human L-BTC amount into base units, or `null` when the input is empty / malformed / has more
 * than `decimals` fractional digits. Kept strict so a bad amount disables submit instead of guessing.
 */
export function parseLbtc(value: string, decimals = 8): bigint | null {
	const trimmed = value.trim();
	if (!trimmed || trimmed === "." || !/^\d*\.?\d*$/.test(trimmed)) return null;

	const [whole = "", fraction = ""] = trimmed.split(".");
	if (fraction.length > decimals) return null;
	if (!whole && !fraction) return null;

	try {
		const padded = fraction.padEnd(decimals, "0");
		return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
	} catch {
		return null;
	}
}

/** Shorten a long id (address / key / txid) to `lead…tail`, e.g. `tex1qab…7f0c`. */
export function truncateMiddle(value: string, lead = 6, tail = 4): string {
	if (!value) return "";
	return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
