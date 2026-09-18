import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const GENERATED_SEED_MATERIAL_BYTES = 32;

export const MNEMONIC_STRENGTH_BITS = 128;
export const MNEMONIC_WORD_COUNT = 12;

function generateSeedMaterial(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_SEED_MATERIAL_BYTES));
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function generateMnemonicPhrase(): string {
	return generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS);
}

function normalizeMnemonic(mnemonic: string): string {
	return mnemonic.trim().replace(/\s+/g, " ").toLowerCase();
}

function splitMnemonicWords(mnemonic: string): string[] {
	const normalized = normalizeMnemonic(mnemonic);

	return normalized.length === 0 ? [] : normalized.split(" ");
}

function isValidMnemonic(mnemonic: string): boolean {
	return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

export const keyManagerSecretMaterial = {
	generateMnemonic: generateMnemonicPhrase,
	generateSecret: generateSeedMaterial,
	generateSeedMaterial,
	isValidMnemonic,
	normalizeMnemonic,
	splitMnemonicWords,
};
