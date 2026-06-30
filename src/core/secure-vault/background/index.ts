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
	generateVaultDataKey,
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

export async function initializeSecureVaultStorage(): Promise<SecureVaultStatus> {
	await restrictSecureVaultStorageAccess();
	clearUnlockedSecureVault();

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
	setUnlockedSecureVault(record, dataKey);
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
		const dataKey = await unwrapVaultDataKey({
			additionalData: toWrappedDataKeyAdditionalData(),
			ciphertext: base64ToBytes(record.wrappedDataKey.ciphertext),
			iv: base64ToBytes(record.wrappedDataKey.iv),
			wrappingKey,
		});

		setUnlockedSecureVault(record, dataKey);
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
	clearUnlockedSecureVault();

	return getSecureVaultStatus();
}

export async function resetSecureVault(): Promise<SecureVaultStatus> {
	clearUnlockedSecureVault();
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

function setUnlockedSecureVault(record: SecureVaultMetaRecord, dataKey: CryptoKey): void {
	unlockedMetaRecord = record;
	unlockedStorage = createBrowserSecureVaultStorage({
		dataKey,
		metaRecord: record,
		onMetaRecordChange: (nextRecord) => {
			unlockedMetaRecord = nextRecord;
		},
	});
}

function clearUnlockedSecureVault(): void {
	unlockedStorage = null;
	unlockedMetaRecord = null;
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
