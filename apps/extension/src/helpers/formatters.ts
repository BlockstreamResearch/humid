import dayjs from "dayjs";
import "dayjs/locale/en";

export function setDayjsLocale(locale: string) {
	dayjs.locale(locale);
}

export function handleTimestamp(timestamp: number) {
	const nowMs = dayjs().valueOf();

	if (Math.abs(nowMs - timestamp) > Math.abs(nowMs - timestamp * 1000)) {
		return dayjs.unix(timestamp);
	}

	return dayjs(timestamp);
}

export function formatDateDMYT(date: Date | number) {
	return dayjs(date).format("DD.MM.YYYY HH:mm");
}

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

export function truncateMiddle(value: string, lead = 6, tail = 4) {
	if (value.length <= lead + tail + 1) return value;

	return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

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

export function parseBaseUnits(value: string): bigint {
	try {
		return BigInt(value);
	} catch {
		return 0n;
	}
}

export function parseUnits(value: string, decimals: number): string | null {
	const trimmed = value.trim();

	if (!/^\d*\.?\d*$/u.test(trimmed) || trimmed === "" || trimmed === ".") return null;

	const [whole = "", fraction = ""] = trimmed.split(".");

	if (fraction.length > decimals) return null;

	const digits = `${whole}${fraction.padEnd(decimals, "0")}`;

	return digits.replace(/^0+(?=\d)/u, "");
}
