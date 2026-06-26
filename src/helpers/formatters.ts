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
