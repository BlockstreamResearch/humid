import browser from "webextension-polyfill";

import type { SecureVaultStorage } from "../types";
import {
	base64ToBytes,
	bytesToBase64,
	decryptVaultString,
	encryptVaultString,
	randomBytes,
	SECURE_VAULT_CRYPTO,
	stringToBase64Url,
} from "./crypto";
import {
	isSecureVaultItemRecord,
	isSecureVaultMetaRecord,
	LEGACY_SECURE_VAULT_STORAGE_KEYS,
	SECURE_VAULT_ADDITIONAL_DATA,
	SECURE_VAULT_AES,
	SECURE_VAULT_ITEM_STORAGE_PREFIX,
	SECURE_VAULT_META_STORAGE_KEY,
	SECURE_VAULT_VERSION,
	type SecureVaultItemRecord,
	type SecureVaultMetaRecord,
} from "./records";

type StorageAreaWithAccessLevel = typeof browser.storage.local & {
	setAccessLevel?: (options: {
		accessLevel: "TRUSTED_CONTEXTS" | "TRUSTED_AND_UNTRUSTED_CONTEXTS";
	}) => Promise<void>;
};

export async function restrictSecureVaultStorageAccess(): Promise<void> {
	const storageArea = browser.storage.local as StorageAreaWithAccessLevel;

	await storageArea.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
}

export async function readSecureVaultMetaRecord(): Promise<SecureVaultMetaRecord | null> {
	const result = await browser.storage.local.get(SECURE_VAULT_META_STORAGE_KEY);
	const record = result[SECURE_VAULT_META_STORAGE_KEY];

	if (!isSecureVaultMetaRecord(record)) {
		return null;
	}

	return record;
}

export async function writeSecureVaultMetaRecord(record: SecureVaultMetaRecord): Promise<void> {
	await browser.storage.local.set({
		[SECURE_VAULT_META_STORAGE_KEY]: record,
	});
}

export async function removeSecureVaultRecords(): Promise<void> {
	const allStorage = await browser.storage.local.get(null);
	const keysToRemove = Object.keys(allStorage).filter(
		(key) =>
			(LEGACY_SECURE_VAULT_STORAGE_KEYS as readonly string[]).includes(key) ||
			key === SECURE_VAULT_META_STORAGE_KEY ||
			key.startsWith(SECURE_VAULT_ITEM_STORAGE_PREFIX),
	);

	if (keysToRemove.length > 0) {
		await browser.storage.local.remove(keysToRemove);
	}
}

export function createBrowserSecureVaultStorage(input: {
	dataKey: CryptoKey;
	metaRecord: SecureVaultMetaRecord;
	onMetaRecordChange: (record: SecureVaultMetaRecord) => void;
}): SecureVaultStorage {
	let currentMetaRecord = input.metaRecord;

	const updateMetaRecord = async (updatedAt: number) => {
		currentMetaRecord = {
			...currentMetaRecord,
			updatedAt,
		};

		await writeSecureVaultMetaRecord(currentMetaRecord);
		input.onMetaRecordChange(currentMetaRecord);
	};

	return {
		deleteItem: async (key) => {
			await browser.storage.local.remove(toItemStorageKey(key));
			await updateMetaRecord(Date.now());
		},
		getItem: (key) => inputStorageGetItem(key),
		setItem: (key, value) => inputStorageSetItem(key, value),
		updateItem: async (key, update) => {
			const nextValue = update(await inputStorageGetItem(key));
			await inputStorageSetItem(key, nextValue);

			return nextValue;
		},
	};

	async function inputStorageGetItem(key: string): Promise<string | null> {
		const result = await browser.storage.local.get(toItemStorageKey(key));
		const record = result[toItemStorageKey(key)];

		if (!isSecureVaultItemRecord(record)) {
			return null;
		}

		return decryptVaultString({
			additionalData: toItemAdditionalData(key),
			ciphertext: base64ToBytes(record.ciphertext),
			dataKey: input.dataKey,
			iv: base64ToBytes(record.iv),
		});
	}

	async function inputStorageSetItem(key: string, value: string): Promise<void> {
		const now = Date.now();
		const existingRecord = await readSecureVaultItemRecord(key);
		const iv = randomBytes(SECURE_VAULT_AES.ivBytes);
		const ciphertext = await encryptVaultString({
			additionalData: toItemAdditionalData(key),
			dataKey: input.dataKey,
			iv,
			value,
		});

		await browser.storage.local.set({
			[toItemStorageKey(key)]: {
				algorithm: SECURE_VAULT_CRYPTO.algorithm,
				ciphertext: bytesToBase64(ciphertext),
				createdAt: existingRecord?.createdAt ?? now,
				iv: bytesToBase64(iv),
				updatedAt: now,
				version: SECURE_VAULT_VERSION,
			} satisfies SecureVaultItemRecord,
		});
		await updateMetaRecord(now);
	}
}

async function readSecureVaultItemRecord(key: string): Promise<SecureVaultItemRecord | null> {
	const result = await browser.storage.local.get(toItemStorageKey(key));
	const record = result[toItemStorageKey(key)];

	if (!isSecureVaultItemRecord(record)) {
		return null;
	}

	return record;
}

function toItemStorageKey(key: string): string {
	return `${SECURE_VAULT_ITEM_STORAGE_PREFIX}${stringToBase64Url(key)}`;
}

function toItemAdditionalData(key: string): string {
	return `${SECURE_VAULT_ADDITIONAL_DATA}:item:${key}`;
}
