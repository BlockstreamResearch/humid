export const DEFAULT_IDENTITY_URI = "ssh://humid@localhost";

export const DEFAULT_IDENTITY_CHALLENGE =
	"4c69717569642057616c6c6574205250432050726f66696c65206964656e74697479206368616c6c656e6765";

export const DEFAULT_KDF_INFO = "68756d69642d7765622d74657374";

function groupThousands(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatLbtc(base: bigint, decimals = 8): string {
	const negative = base < 0n;
	const abs = negative ? -base : base;
	const divisor = 10n ** BigInt(decimals);
	const whole = groupThousands((abs / divisor).toString());
	const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
	const body = fraction ? `${whole}.${fraction}` : whole;
	return negative ? `-${body}` : body;
}

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

export function truncateMiddle(value: string, lead = 6, tail = 4): string {
	if (!value) return "";
	return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
