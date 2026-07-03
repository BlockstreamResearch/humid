const PBKDF2_HASH = "SHA-256";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const SECURE_VAULT_CRYPTO = {
	algorithm: "AES-GCM",
	kdfHash: PBKDF2_HASH,
} as const;

export async function deriveVaultWrappingKey(input: {
	iterations: number;
	passphrase: string;
	salt: Uint8Array;
}): Promise<CryptoKey> {
	const passphraseKey = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(input.passphrase),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: PBKDF2_HASH,
			salt: toArrayBuffer(input.salt),
			iterations: input.iterations,
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

export async function generateVaultDataKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey(
		{
			name: "AES-GCM",
			length: 256,
		},
		true,
		["encrypt", "decrypt"],
	);
}

export async function wrapVaultDataKey(input: {
	additionalData: string;
	dataKey: CryptoKey;
	iv: Uint8Array;
	wrappingKey: CryptoKey;
}): Promise<Uint8Array> {
	const rawDataKey = await crypto.subtle.exportKey("raw", input.dataKey);
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(input.iv),
			additionalData: textEncoder.encode(input.additionalData),
		},
		input.wrappingKey,
		rawDataKey,
	);

	return new Uint8Array(ciphertext);
}

export async function unwrapVaultDataKey(input: {
	additionalData: string;
	ciphertext: Uint8Array;
	iv: Uint8Array;
	wrappingKey: CryptoKey;
}): Promise<{ dataKey: CryptoKey; rawDataKey: Uint8Array }> {
	const rawDataKey = await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(input.iv),
			additionalData: textEncoder.encode(input.additionalData),
		},
		input.wrappingKey,
		toArrayBuffer(input.ciphertext),
	);

	return {
		dataKey: await importVaultDataKey(new Uint8Array(rawDataKey)),
		rawDataKey: new Uint8Array(rawDataKey),
	};
}

/** Import a raw AES-GCM data key (e.g. one restored from session storage) as non-extractable. */
export async function importVaultDataKey(rawDataKey: Uint8Array): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", toArrayBuffer(rawDataKey), { name: "AES-GCM" }, false, [
		"encrypt",
		"decrypt",
	]);
}

/** Export a data key's raw bytes (the generated data key is extractable). */
export async function exportVaultDataKey(dataKey: CryptoKey): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.exportKey("raw", dataKey));
}

export async function encryptVaultString(input: {
	additionalData: string;
	dataKey: CryptoKey;
	iv: Uint8Array;
	value: string;
}): Promise<Uint8Array> {
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(input.iv),
			additionalData: textEncoder.encode(input.additionalData),
		},
		input.dataKey,
		textEncoder.encode(input.value),
	);

	return new Uint8Array(ciphertext);
}

export async function decryptVaultString(input: {
	additionalData: string;
	ciphertext: Uint8Array;
	dataKey: CryptoKey;
	iv: Uint8Array;
}): Promise<string> {
	const plaintext = await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(input.iv),
			additionalData: textEncoder.encode(input.additionalData),
		},
		input.dataKey,
		toArrayBuffer(input.ciphertext),
	);

	return textDecoder.decode(plaintext);
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

export function randomBytes(length: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(length));
}

export function stringToBase64Url(value: string): string {
	return bytesToBase64(textEncoder.encode(value))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer as ArrayBuffer;
}
