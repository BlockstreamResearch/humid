import browser from "webextension-polyfill";

import type { VaultCreateInput, VaultStatus, VaultUnlockInput } from "./types";

const VAULT_STORAGE_KEY = "humid:vault:v1";
const VAULT_VERSION = 1;
const VAULT_ADDITIONAL_DATA = "humid:vault:v1";
const PBKDF2_HASH = "SHA-256";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_COOLDOWN_MS = 30_000;

type VaultRecord = {
	version: typeof VAULT_VERSION;
	algorithm: "AES-GCM";
	kdf: {
		name: "PBKDF2";
		hash: typeof PBKDF2_HASH;
		iterations: number;
		salt: string;
	};
	iv: string;
	ciphertext: string;
	createdAt: number;
	updatedAt: number;
};

type StorageAreaWithAccessLevel = typeof browser.storage.local & {
	setAccessLevel?: (options: {
		accessLevel: "TRUSTED_CONTEXTS" | "TRUSTED_AND_UNTRUSTED_CONTEXTS";
	}) => Promise<void>;
};

let unlockedSecret: string | null = null;
let failedUnlockAttempts = 0;
let unlockPausedUntil = 0;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function initializeVaultStorage(): Promise<VaultStatus> {
	await restrictStorageAccess();
	unlockedSecret = null;

	return getVaultStatus();
}

export async function createVault(input: VaultCreateInput): Promise<VaultStatus> {
	const passphrase = requireNonEmpty(input.passphrase, "Missing passphrase");
	const secret = requireNonEmpty(input.secret, "Missing secret");
	const existingRecord = await readVaultRecord();

	if (existingRecord) {
		throw new Error("Vault already exists. Reset it before creating a new one.");
	}

	const now = Date.now();
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const key = await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS);
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(iv),
			additionalData: textEncoder.encode(VAULT_ADDITIONAL_DATA),
		},
		key,
		textEncoder.encode(secret),
	);

	const record: VaultRecord = {
		version: VAULT_VERSION,
		algorithm: "AES-GCM",
		kdf: {
			name: "PBKDF2",
			hash: PBKDF2_HASH,
			iterations: PBKDF2_ITERATIONS,
			salt: bytesToBase64(salt),
		},
		iv: bytesToBase64(iv),
		ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
		createdAt: now,
		updatedAt: now,
	};

	await writeVaultRecord(record);
	unlockedSecret = secret;
	resetUnlockAttempts();

	return toVaultStatus(record);
}

export async function unlockVault(input: VaultUnlockInput): Promise<VaultStatus> {
	const passphrase = requireNonEmpty(input.passphrase, "Missing passphrase");
	const record = await requireVaultRecord();
	const pausedMs = unlockPausedUntil - Date.now();

	if (pausedMs > 0) {
		throw new Error(`Too many incorrect attempts. Try again in ${formatSeconds(pausedMs)}.`);
	}

	const key = await deriveVaultKey(
		passphrase,
		base64ToBytes(record.kdf.salt),
		record.kdf.iterations,
	);

	try {
		const plaintext = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: toArrayBuffer(base64ToBytes(record.iv)),
				additionalData: textEncoder.encode(VAULT_ADDITIONAL_DATA),
			},
			key,
			toArrayBuffer(base64ToBytes(record.ciphertext)),
		);

		unlockedSecret = textDecoder.decode(plaintext);
		resetUnlockAttempts();

		return toVaultStatus(record);
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

export async function lockVault(): Promise<VaultStatus> {
	unlockedSecret = null;

	return getVaultStatus();
}

export async function resetVault(): Promise<VaultStatus> {
	unlockedSecret = null;
	resetUnlockAttempts();
	await browser.storage.local.remove(VAULT_STORAGE_KEY);

	return getVaultStatus();
}

export async function getVaultStatus(): Promise<VaultStatus> {
	const record = await readVaultRecord();

	if (!record) {
		return {
			hasVault: false,
			isUnlocked: false,
		};
	}

	return toVaultStatus(record);
}

export function getUnlockedSecret(): string {
	if (!unlockedSecret) {
		throw new Error("Vault is locked");
	}

	return unlockedSecret;
}

async function restrictStorageAccess(): Promise<void> {
	const storageArea = browser.storage.local as StorageAreaWithAccessLevel;

	await storageArea.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
}

async function requireVaultRecord(): Promise<VaultRecord> {
	const record = await readVaultRecord();

	if (!record) {
		throw new Error("Vault was not created");
	}

	return record;
}

async function readVaultRecord(): Promise<VaultRecord | null> {
	const result = await browser.storage.local.get(VAULT_STORAGE_KEY);
	const record = result[VAULT_STORAGE_KEY];

	if (!isVaultRecord(record)) {
		return null;
	}

	return record;
}

async function writeVaultRecord(record: VaultRecord): Promise<void> {
	await browser.storage.local.set({
		[VAULT_STORAGE_KEY]: record,
	});
}

async function deriveVaultKey(
	passphrase: string,
	salt: Uint8Array,
	iterations: number,
): Promise<CryptoKey> {
	const passphraseKey = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(passphrase),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: PBKDF2_HASH,
			salt: toArrayBuffer(salt),
			iterations,
		},
		passphraseKey,
		{
			name: "AES-GCM",
			length: 256,
		},
		false,
		["encrypt", "decrypt"],
	);
}

function toVaultStatus(record: VaultRecord): VaultStatus {
	return {
		hasVault: true,
		isUnlocked: unlockedSecret !== null,
		createdAt: record.createdAt,
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

function isVaultRecord(value: unknown): value is VaultRecord {
	if (typeof value !== "object" || value === null) return false;

	const record = value as Partial<VaultRecord>;

	return (
		record.version === VAULT_VERSION &&
		record.algorithm === "AES-GCM" &&
		typeof record.ciphertext === "string" &&
		typeof record.iv === "string" &&
		typeof record.createdAt === "number" &&
		typeof record.updatedAt === "number" &&
		typeof record.kdf === "object" &&
		record.kdf !== null &&
		record.kdf.name === "PBKDF2" &&
		record.kdf.hash === PBKDF2_HASH &&
		typeof record.kdf.iterations === "number" &&
		typeof record.kdf.salt === "string"
	);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer as ArrayBuffer;
}
