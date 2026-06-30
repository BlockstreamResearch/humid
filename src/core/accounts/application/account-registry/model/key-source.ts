import type { KeySourceId } from "./identifiers";
import type { TimestampMs } from "./time";

export type KeySourceKind =
	| "external-signer"
	| "hardware"
	| "imported-mnemonic"
	| "imported-private-key"
	| "local-root";

export type SecretMaterialKind = "mnemonic" | "private-key" | "seed";

export type SecretMaterialStorage = "encrypted-vault" | "external";

export type KeySourceMaterialRef = {
	fingerprint?: string;
	kind: SecretMaterialKind;
	storage: SecretMaterialStorage;
};

export type KeySourceRecord = {
	createdAt: TimestampMs;
	id: KeySourceId;
	kind: KeySourceKind;
	material: KeySourceMaterialRef;
	metadata?: Record<string, unknown>;
	name: string;
	updatedAt: TimestampMs;
};
