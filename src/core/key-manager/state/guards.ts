import type {
	KeyManagerState,
	KeyringMaterial,
	KeyringRecord,
	WalletAccountRecord,
} from "../types";
import { KEY_MANAGER_STATE_VERSION } from "./constants";

export function isKeyManagerState(value: unknown): value is KeyManagerState {
	if (!isObject(value)) return false;

	const state = value as Partial<KeyManagerState>;

	return (
		state.version === KEY_MANAGER_STATE_VERSION &&
		typeof state.createdAt === "number" &&
		typeof state.updatedAt === "number" &&
		Array.isArray(state.keyrings) &&
		state.keyrings.every(isKeyringRecord) &&
		Array.isArray(state.accounts) &&
		state.accounts.every(isWalletAccountRecord)
	);
}

function isKeyringRecord(value: unknown): value is KeyringRecord {
	if (!isObject(value)) return false;

	const keyring = value as Partial<KeyringRecord>;

	return (
		typeof keyring.id === "string" &&
		typeof keyring.type === "string" &&
		typeof keyring.name === "string" &&
		typeof keyring.createdAt === "number" &&
		typeof keyring.updatedAt === "number" &&
		Array.isArray(keyring.accounts) &&
		keyring.accounts.every((accountId) => typeof accountId === "string") &&
		isKeyringMaterial(keyring.material)
	);
}

function isKeyringMaterial(value: unknown): value is KeyringMaterial {
	if (!isObject(value)) return false;

	const material = value as Partial<KeyringMaterial>;

	return (
		material.kind === "seed" && material.encoding === "utf8" && typeof material.value === "string"
	);
}

function isWalletAccountRecord(value: unknown): value is WalletAccountRecord {
	if (!isObject(value)) return false;

	const account = value as Partial<WalletAccountRecord>;

	return (
		typeof account.id === "string" &&
		typeof account.keyringId === "string" &&
		typeof account.namespace === "string" &&
		typeof account.chainId === "string" &&
		typeof account.address === "string" &&
		typeof account.createdAt === "number" &&
		typeof account.updatedAt === "number"
	);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
