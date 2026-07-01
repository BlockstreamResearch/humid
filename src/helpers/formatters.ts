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
 * no floating-point rounding. Non-numeric input formats as "0".
 */
export function formatUnits(amount: string, decimals: number) {
	const negative = amount.startsWith("-");
	const raw = negative ? amount.slice(1) : amount;

	if (!/^\d+$/u.test(raw)) return "0";

	const digits = raw.padStart(decimals + 1, "0");
	const whole = digits.slice(0, digits.length - decimals);
	const fraction = digits.slice(digits.length - decimals).replace(/0+$/u, "");
	const sign = negative ? "-" : "";

	return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}
