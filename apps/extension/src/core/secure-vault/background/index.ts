import browser from "webextension-polyfill";

import type {
	SecureVaultCreateInput,
	SecureVaultStatus,
	SecureVaultStorage,
	SecureVaultUnlockInput,
} from "../types";
import {
	base64ToBytes,
	bytesToBase64,
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

let unlockedStorage: SecureVaultStorage | null = null;
let unlockedMetaRecord: SecureVaultMetaRecord | null = null;
let failedUnlockAttempts = 0;
let unlockPausedUntil = 0;

// The raw AES data key is cached in `chrome.storage.session` while unlocked. Session storage is
// in-memory (never on disk), reachable only from trusted contexts, and cleared when the browser
// closes — so the vault survives MV3 service-worker restarts yet still locks on full browser exit.
const SESSION_DATA_KEY_STORAGE_KEY = "secure-vault:session-data-key";

type SessionStorageArea = {
	get: (key: string) => Promise<Record<string, unknown>>;
	set: (items: Record<string, unknown>) => Promise<void>;
	remove: (key: string) => Promise<void>;
};

/** `chrome.storage.session`, or undefined on browsers that don't expose it (then: no persistence). */
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

// Last time the user actively used the wallet, cached alongside the key so the idle auto-lock
// timer survives service-worker restarts (and resets on browser close).
const SESSION_LAST_ACTIVITY_KEY = "secure-vault:last-activity";

/** Record wallet activity now — resets the idle auto-lock countdown. */
export async function touchVaultActivity(): Promise<void> {
	await getSessionStorage()?.set({ [SESSION_LAST_ACTIVITY_KEY]: Date.now() });
}

/** The last recorded activity timestamp, or null when unknown / unsupported. */
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
	const passphrase = requireNonEmpty(input.passphrase, "Missing passphrase");
	const existingRecord = await readSecureVaultMetaRecord();

	if (existingRecord) {
		throw new Error("Vault already exists. Reset it before creating a new one.");
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
	resetUnlockAttempts();

	return toSecureVaultStatus(record);
}

export async function unlockSecureVault(input: SecureVaultUnlockInput): Promise<SecureVaultStatus> {
	const passphrase = requireNonEmpty(input.passphrase, "Missing passphrase");
	const record = await requireSecureVaultMetaRecord();
	const pausedMs = unlockPausedUntil - Date.now();

	if (pausedMs > 0) {
		throw new Error(`Too many incorrect attempts. Try again in ${formatSeconds(pausedMs)}.`);
	}

	const wrappingKey = await deriveVaultWrappingKey({
		iterations: record.kdf.iterations,
		passphrase,
		salt: base64ToBytes(record.kdf.salt),
	});

	try {
		const { dataKey, rawDataKey } = await unwrapVaultDataKey({
			additionalData: toWrappedDataKeyAdditionalData(),
			ciphertext: base64ToBytes(record.wrappedDataKey.ciphertext),
			iv: base64ToBytes(record.wrappedDataKey.iv),
			wrappingKey,
		});

		applyUnlockedSecureVault(record, dataKey);
		await persistSessionDataKey(rawDataKey);
		resetUnlockAttempts();

		return toSecureVaultStatus(record);
	} catch {
		failedUnlockAttempts += 1;

		const attemptsRemaining = Math.max(0, MAX_UNLOCK_ATTEMPTS - failedUnlockAttempts);

		if (attemptsRemaining === 0) {
			unlockPausedUntil = Date.now() + UNLOCK_COOLDOWN_MS;
			throw new Error(
				`Too many incorrect attempts. Try again in ${formatSeconds(UNLOCK_COOLDOWN_MS)}.`,
			);
		}

		throw new Error(
			`Password did not unlock this vault. ${attemptsRemaining} ${
				attemptsRemaining === 1 ? "attempt" : "attempts"
			} remaining.`,
		);
	}
}

export async function lockSecureVault(): Promise<SecureVaultStatus> {
	await clearUnlockedSecureVault();

	return getSecureVaultStatus();
}

export async function resetSecureVault(): Promise<SecureVaultStatus> {
	await clearUnlockedSecureVault();
	resetUnlockAttempts();
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
		throw new Error("Vault is locked");
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

/** Re-derive the in-memory unlocked vault from the session-cached data key after a SW restart. */
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
		throw new Error("Vault was not created");
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

function requireNonEmpty(value: string, message: string): string {
	if (!value) {
		throw new Error(message);
	}

	return value;
}

function resetUnlockAttempts(): void {
	failedUnlockAttempts = 0;
	unlockPausedUntil = 0;
}

function formatSeconds(ms: number): string {
	const seconds = Math.ceil(ms / 1000);

	return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function toWrappedDataKeyAdditionalData(): string {
	return `${SECURE_VAULT_ADDITIONAL_DATA}:data-key`;
}
