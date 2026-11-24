import browser from "webextension-polyfill";

import { base64ToBytes, bytesToBase64 } from "@/helpers/base64";

import {
	MIN_PASSPHRASE_LENGTH,
	type SecureVaultCreateInput,
	type SecureVaultStatus,
	type SecureVaultStorage,
	type SecureVaultUnlockInput,
} from "../types";
import {
	deriveVaultWrappingKey,
	exportVaultDataKey,
	generateVaultDataKey,
	importVaultDataKey,
	randomBytes,
	SECURE_VAULT_CRYPTO,
	unwrapVaultDataKey,
	wrapVaultDataKey,
} from "./crypto";
import {
	SECURE_VAULT_ADDITIONAL_DATA,
	SECURE_VAULT_AES,
	SECURE_VAULT_KDF,
	SECURE_VAULT_VERSION,
	type SecureVaultMetaRecord,
} from "./records";
import {
	createBrowserSecureVaultStorage,
	readSecureVaultMetaRecord,
	removeSecureVaultRecords,
	restrictSecureVaultStorageAccess,
	writeSecureVaultMetaRecord,
} from "./storage";

const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_COOLDOWN_MS = 30_000;

// Failures outlive the service worker, so restarting the extension never resets the count.
const UNLOCK_THROTTLE_STORAGE_KEY = "secure-vault:unlock-throttle";

type UnlockThrottle = { failed: number; pausedUntil: number };

let unlockedStorage: SecureVaultStorage | null = null;
let unlockedMetaRecord: SecureVaultMetaRecord | null = null;
let passphraseChecks: Promise<unknown> = Promise.resolve();

const SESSION_DATA_KEY_STORAGE_KEY = "secure-vault:session-data-key";

type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	set: (items: Record<string, unknown>) => Promise<void>;
	remove: (key: string) => Promise<void>;
};

function getSessionStorage(): SessionStorageArea | undefined {
	return (browser.storage as unknown as { session?: SessionStorageArea }).session;
}

async function persistSessionDataKey(rawDataKey: Uint8Array): Promise<void> {
	await getSessionStorage()?.set({ [SESSION_DATA_KEY_STORAGE_KEY]: bytesToBase64(rawDataKey) });
}

async function readSessionDataKey(): Promise<Uint8Array | null> {
	const session = getSessionStorage();

	if (!session) return null;

	const result = await session.get(SESSION_DATA_KEY_STORAGE_KEY);
	const value = result[SESSION_DATA_KEY_STORAGE_KEY];

	return typeof value === "string" ? base64ToBytes(value) : null;
}

async function clearSessionDataKey(): Promise<void> {
	await getSessionStorage()?.remove(SESSION_DATA_KEY_STORAGE_KEY);
}

const SESSION_LAST_ACTIVITY_KEY = "secure-vault:last-activity";

export async function touchVaultActivity(): Promise<void> {
	await getSessionStorage()?.set({ [SESSION_LAST_ACTIVITY_KEY]: Date.now() });
}

export async function getVaultLastActivityAt(): Promise<number | null> {
	const session = getSessionStorage();

	if (!session) return null;

	const result = await session.get(SESSION_LAST_ACTIVITY_KEY);
	const value = result[SESSION_LAST_ACTIVITY_KEY];

	return typeof value === "number" ? value : null;
}

async function clearSessionActivity(): Promise<void> {
	await getSessionStorage()?.remove(SESSION_LAST_ACTIVITY_KEY);
}

export async function initializeSecureVaultStorage(): Promise<SecureVaultStatus> {
	await restrictSecureVaultStorageAccess();
	await restoreUnlockedSecureVault();

	return getSecureVaultStatus();
}

export async function createSecureVault(input: SecureVaultCreateInput): Promise<SecureVaultStatus> {
	const { passphrase } = input;

	if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
		throw new Error(`The password must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
	}

	const existingRecord = await readSecureVaultMetaRecord();

	if (existingRecord) {
		throw new Error("A wallet already exists. Reset it before creating a new one.");
	}

	const now = Date.now();
	const salt = randomBytes(SECURE_VAULT_KDF.saltBytes);
	const wrappingIv = randomBytes(SECURE_VAULT_AES.ivBytes);
	const wrappingKey = await deriveVaultWrappingKey({
		iterations: SECURE_VAULT_KDF.iterations,
		passphrase,
		salt,
	});
	const dataKey = await generateVaultDataKey();
	const wrappedDataKey = await wrapVaultDataKey({
		additionalData: toWrappedDataKeyAdditionalData(),
		dataKey,
		iv: wrappingIv,
		wrappingKey,
	});
	const record: SecureVaultMetaRecord = {
		algorithm: SECURE_VAULT_CRYPTO.algorithm,
		createdAt: now,
		kdf: {
			hash: SECURE_VAULT_CRYPTO.kdfHash,
			iterations: SECURE_VAULT_KDF.iterations,
			name: "PBKDF2",
			salt: bytesToBase64(salt),
		},
		updatedAt: now,
		version: SECURE_VAULT_VERSION,
		wrappedDataKey: {
			algorithm: SECURE_VAULT_CRYPTO.algorithm,
			ciphertext: bytesToBase64(wrappedDataKey),
			iv: bytesToBase64(wrappingIv),
		},
	};

	await writeSecureVaultMetaRecord(record);
	applyUnlockedSecureVault(record, dataKey);
	await persistSessionDataKey(await exportVaultDataKey(dataKey));
	await resetUnlockAttempts();

	return toSecureVaultStatus(record);
}

export async function unlockSecureVault(input: SecureVaultUnlockInput): Promise<SecureVaultStatus> {
	const { dataKey, rawDataKey, record } = await checkPassphrase(input.passphrase);

	applyUnlockedSecureVault(record, dataKey);
	await persistSessionDataKey(rawDataKey);

	return toSecureVaultStatus(record);
}

/** Proves the password before a sensitive action, counting toward the same throttle as unlocking. */
export async function verifySecureVaultPassphrase(passphrase: string): Promise<void> {
	await checkPassphrase(passphrase);
}

export async function lockSecureVault(): Promise<SecureVaultStatus> {
	await clearUnlockedSecureVault();

	return getSecureVaultStatus();
}

export async function resetSecureVault(): Promise<SecureVaultStatus> {
	await clearUnlockedSecureVault();
	await resetUnlockAttempts();
	await removeSecureVaultRecords();

	return getSecureVaultStatus();
}

export async function getSecureVaultStatus(): Promise<SecureVaultStatus> {
	const record = await readSecureVaultMetaRecord();

	if (!record) {
		return {
			hasVault: false,
			isUnlocked: false,
		};
	}

	return toSecureVaultStatus(record);
}

export function getUnlockedSecureVaultStorage(): SecureVaultStorage {
	if (!unlockedStorage) {
		throw new Error("Wallet is locked");
	}

	return unlockedStorage;
}

function applyUnlockedSecureVault(record: SecureVaultMetaRecord, dataKey: CryptoKey): void {
	unlockedMetaRecord = record;
	unlockedStorage = createBrowserSecureVaultStorage({
		dataKey,
		metaRecord: record,
		onMetaRecordChange: (nextRecord) => {
			unlockedMetaRecord = nextRecord;
		},
	});
}

async function restoreUnlockedSecureVault(): Promise<void> {
	const rawDataKey = await readSessionDataKey();

	if (!rawDataKey) {
		clearUnlockedSecureVaultMemory();
		return;
	}

	const record = await readSecureVaultMetaRecord();

	if (!record) {
		clearUnlockedSecureVaultMemory();
		await clearSessionDataKey();
		return;
	}

	applyUnlockedSecureVault(record, await importVaultDataKey(rawDataKey));
}

function clearUnlockedSecureVaultMemory(): void {
	unlockedStorage = null;
	unlockedMetaRecord = null;
}

async function clearUnlockedSecureVault(): Promise<void> {
	clearUnlockedSecureVaultMemory();
	await Promise.all([clearSessionDataKey(), clearSessionActivity()]);
}

async function requireSecureVaultMetaRecord(): Promise<SecureVaultMetaRecord> {
	const record = await readSecureVaultMetaRecord();

	if (!record) {
		throw new Error("Wallet was not created");
	}

	return record;
}

function toSecureVaultStatus(record: SecureVaultMetaRecord): SecureVaultStatus {
	return {
		createdAt: record.createdAt,
		hasVault: true,
		isUnlocked: unlockedMetaRecord !== null,
		updatedAt: record.updatedAt,
	};
}

/** Checks run one at a time, so parallel guesses cannot slip past the throttle. */
function checkPassphrase(passphrase: string) {
	const check = passphraseChecks.then(() => unwrapWithPassphrase(passphrase));

	passphraseChecks = check.catch(() => undefined);

	return check;
}

async function unwrapWithPassphrase(passphrase: string) {
	if (!passphrase) throw new Error("Missing passphrase");

	const record = await requireSecureVaultMetaRecord();
	const throttle = await readUnlockThrottle();
	const pausedMs = throttle.pausedUntil - Date.now();

	if (pausedMs > 0) {
		throw new Error(`Too many incorrect attempts. Try again in ${formatSeconds(pausedMs)}.`);
	}

	const wrappingKey = await deriveVaultWrappingKey({
		iterations: record.kdf.iterations,
		passphrase,
		salt: base64ToBytes(record.kdf.salt),
	});

	try {
		const unwrapped = await unwrapVaultDataKey({
			additionalData: toWrappedDataKeyAdditionalData(),
			ciphertext: base64ToBytes(record.wrappedDataKey.ciphertext),
			iv: base64ToBytes(record.wrappedDataKey.iv),
			wrappingKey,
		});

		await resetUnlockAttempts();

		return { ...unwrapped, record };
	} catch {
		const failed = throttle.failed + 1;
		const paused = failed >= MAX_UNLOCK_ATTEMPTS;

		await writeUnlockThrottle({
			failed,
			pausedUntil: paused ? Date.now() + UNLOCK_COOLDOWN_MS : 0,
		});

		throw new Error(
			paused
				? `Too many incorrect attempts. Try again in ${formatSeconds(UNLOCK_COOLDOWN_MS)}.`
				: "Wrong password. Try again.",
		);
	}
}

async function readUnlockThrottle(): Promise<UnlockThrottle> {
	const stored = (await browser.storage.local.get(UNLOCK_THROTTLE_STORAGE_KEY))[
		UNLOCK_THROTTLE_STORAGE_KEY
	] as Partial<UnlockThrottle> | undefined;

	return { failed: stored?.failed ?? 0, pausedUntil: stored?.pausedUntil ?? 0 };
}

async function writeUnlockThrottle(throttle: UnlockThrottle): Promise<void> {
	await browser.storage.local.set({ [UNLOCK_THROTTLE_STORAGE_KEY]: throttle });
}

async function resetUnlockAttempts(): Promise<void> {
	await browser.storage.local.remove(UNLOCK_THROTTLE_STORAGE_KEY);
}

function formatSeconds(ms: number): string {
	const seconds = Math.ceil(ms / 1000);

	return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function toWrappedDataKeyAdditionalData(): string {
	return `${SECURE_VAULT_ADDITIONAL_DATA}:data-key`;
}
