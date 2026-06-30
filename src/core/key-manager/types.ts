import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { KeySourceId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { SecretMaterialKind } from "@/core/accounts/application/account-registry/model/key-source";
import type { TimestampMs } from "@/core/accounts/application/account-registry/model/time";

export type SecretMaterialEncoding = "utf8";

export type SecretMaterialRecord = {
	createdAt: TimestampMs;
	encoding: SecretMaterialEncoding;
	keySourceId: KeySourceId;
	kind: SecretMaterialKind;
	updatedAt: TimestampMs;
	value: string;
};

export type KeyManagerState = {
	accountModel: AccountModelState;
	createdAt: TimestampMs;
	secretMaterials: Record<KeySourceId, SecretMaterialRecord>;
	updatedAt: TimestampMs;
	version: 2;
};

export type UpdateKeyManagerState = (
	update: (state: KeyManagerState) => KeyManagerState,
) => Promise<KeyManagerState>;

export type CreateLocalRootKeyManagerStateInput = {
	createdAt?: TimestampMs;
	keySourceId?: KeySourceId;
	name?: string;
	seedMaterial: string;
	source?: "generated" | "imported";
};
