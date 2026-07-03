import browser from "webextension-polyfill";

const AUTO_LOCK_MINUTES_STORAGE_KEY = "wallet-vault:auto-lock-minutes";

/** Selectable idle auto-lock timeouts (minutes). 0 = only lock on browser close or manual lock. */
export const AUTO_LOCK_MINUTES_OPTIONS = [5, 15, 30, 60, 0] as const;

export const DEFAULT_AUTO_LOCK_MINUTES = 15;

function isAutoLockMinutes(value: unknown): value is number {
	return (
		typeof value === "number" && (AUTO_LOCK_MINUTES_OPTIONS as readonly number[]).includes(value)
	);
}

/** The configured idle auto-lock timeout in minutes (0 = disabled). Persisted in local storage. */
export async function getAutoLockMinutes(): Promise<number> {
	const result = await browser.storage.local.get(AUTO_LOCK_MINUTES_STORAGE_KEY);
	const value = result[AUTO_LOCK_MINUTES_STORAGE_KEY];

	return isAutoLockMinutes(value) ? value : DEFAULT_AUTO_LOCK_MINUTES;
}

/** Persist the idle auto-lock timeout, normalizing to a supported option. */
export async function setAutoLockMinutes(minutes: number): Promise<number> {
	const normalized = isAutoLockMinutes(minutes) ? minutes : DEFAULT_AUTO_LOCK_MINUTES;

	await browser.storage.local.set({ [AUTO_LOCK_MINUTES_STORAGE_KEY]: normalized });

	return normalized;
}
