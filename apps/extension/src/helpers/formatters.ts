import dayjs from "dayjs";
import "dayjs/locale/en";

export function setDayjsLocale(locale: string) {
	dayjs.locale(locale);
}

export function handleTimestamp(timestamp: number) {
	const nowMs = dayjs().valueOf();

	// The value can arrive either in seconds or milliseconds — pick whichever
	// interpretation lands closer to "now".
	if (Math.abs(nowMs - timestamp) > Math.abs(nowMs - timestamp * 1000)) {
		return dayjs.unix(timestamp);
	}

	return dayjs(timestamp);
}

export function formatDateDMYT(date: Date | number) {
	return dayjs(date).format("DD.MM.YYYY HH:mm");
}

/**
 * Formats a past timestamp (ms) as a short "time ago" freshness label — "just now", "5m ago",
 * "2h ago", "3d ago". `now` is injectable so callers can tick it on an interval (and tests can
 * pin it). Sub-minute gaps read as "just now"; anything in between rounds down but never to "0m".
 */
export function formatTimeAgo(timestamp: number, now: number = Date.now()): string {
	const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));

	if (seconds < 45) return "just now";

	const minutes = Math.floor(seconds / 60);

	if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

	const hours = Math.floor(minutes / 60);

	if (hours < 24) return `${hours}h ago`;

	return `${Math.floor(hours / 24)}d ago`;
}

export function formatByteLength(length: number) {
	const units = ["B", "KB", "MB", "GB", "TB"];

	let unitIndex = 0;
	let currentLength = length;

	while (currentLength > 1024 && unitIndex < units.length - 1) {
		currentLength /= 1024;
		unitIndex++;
	}

	return `${currentLength.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Truncates the middle of a long identifier (address, hash) for display, keeping
 * the first `lead` and last `tail` characters. Short values pass through.
 */
export function truncateMiddle(value: string, lead = 6, tail = 4) {
	if (value.length <= lead + tail + 1) return value;

	return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/**
 * Formats an integer base-unit amount (e.g. satoshis) as a decimal string with
 * `decimals` fractional places, trimming trailing fractional zeros. BigInt-based, so
 * no floating-point rounding. Accepts the raw bigint or an integer string; non-numeric
 * input formats as "0".
 */
export function formatUnits(amount: bigint | string, decimals: number) {
	const text = typeof amount === "bigint" ? amount.toString() : amount;
	const negative = text.startsWith("-");
	const raw = negative ? text.slice(1) : text;

	if (!/^\d+$/u.test(raw)) return "0";

	const digits = raw.padStart(decimals + 1, "0");
	const whole = digits.slice(0, digits.length - decimals);
	const fraction = digits.slice(digits.length - decimals).replace(/0+$/u, "");
	const sign = negative ? "-" : "";

	return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Parse a base-unit integer string (as it crosses the RPC boundary) to bigint; junk yields 0n. */
export function parseBaseUnits(value: string): bigint {
	try {
		return BigInt(value);
	} catch {
		return 0n;
	}
}
