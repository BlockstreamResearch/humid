import { z } from "zod";

import type { KeyManagerState } from "../types";
import { KEY_MANAGER_STATE_VERSION } from "./constants";

const timestampSchema = z.number().finite();
const metadataSchema = z.record(z.string(), z.unknown());

const prefixedIdSchema = (prefix: string) => z.string().refine((value) => value.startsWith(prefix));

const keySourceIdSchema = prefixedIdSchema("key-source:");
const walletIdSchema = prefixedIdSchema("wallet:");
const accountGroupIdSchema = prefixedIdSchema("account-group:");
const chainAccountIdSchema = prefixedIdSchema("chain-account:");
const addressIdSchema = prefixedIdSchema("address:");
const dappSessionIdSchema = prefixedIdSchema("dapp-session:");

const chainIdSchema = z.string().min(1);
const accountIdentifierSchema = z.string().regex(/^.+:.+$/u);
const chainAccountTypeIdSchema = z.string().regex(/^[^:]+:.+$/);

const derivationLocatorSchema = z.object({
	accountIndex: z.number().int().nonnegative().optional(),
	addressIndex: z.number().int().nonnegative().optional(),
	change: z.number().int().nonnegative().optional(),
	path: z.string().optional(),
	standard: z.string().min(1),
});

const keySourceRecordSchema = z.object({
	createdAt: timestampSchema,
	id: keySourceIdSchema,
	kind: z.enum([
		"external-signer",
		"hardware",
		"imported-mnemonic",
		"imported-private-key",
		"local-root",
	]),
	material: z.object({
		fingerprint: z.string().optional(),
		kind: z.enum(["mnemonic", "private-key", "seed"]),
		storage: z.enum(["encrypted-vault", "external"]),
	}),
	metadata: metadataSchema.optional(),
	name: z.string(),
	updatedAt: timestampSchema,
});

const walletRecordSchema = z.object({
	accountGroupIds: z.array(accountGroupIdSchema),
	createdAt: timestampSchema,
	id: walletIdSchema,
	keySourceId: keySourceIdSchema,
	kind: z.enum(["entropy", "external", "hardware", "single-key"]),
	metadata: metadataSchema.optional(),
	name: z.string(),
	updatedAt: timestampSchema,
});

const accountGroupRecordSchema = z.object({
	chainAccountIds: z.array(chainAccountIdSchema),
	createdAt: timestampSchema,
	groupIndex: z.number().int().nonnegative().optional(),
	hidden: z.boolean().optional(),
	id: accountGroupIdSchema,
	kind: z.enum(["multichain", "single-chain"]),
	metadata: metadataSchema.optional(),
	name: z.string(),
	pinned: z.boolean().optional(),
	updatedAt: timestampSchema,
	walletId: walletIdSchema,
});

const chainAccountRecordSchema = z.object({
	accountGroupId: accountGroupIdSchema,
	accountIdentifier: accountIdentifierSchema,
	accountTypeId: chainAccountTypeIdSchema,
	addressIds: z.array(addressIdSchema),
	chainGroupId: z.string().min(1),
	chainId: chainIdSchema,
	createdAt: timestampSchema,
	derivation: derivationLocatorSchema.optional(),
	id: chainAccountIdSchema,
	keySourceId: keySourceIdSchema,
	metadata: metadataSchema.optional(),
	updatedAt: timestampSchema,
	walletId: walletIdSchema,
});

const addressRecordSchema = z.object({
	address: z.string(),
	chainAccountId: chainAccountIdSchema,
	chainId: chainIdSchema,
	createdAt: timestampSchema,
	derivation: derivationLocatorSchema.optional(),
	id: addressIdSchema,
	kind: z.enum(["change", "identity", "receive"]),
	metadata: metadataSchema.optional(),
	updatedAt: timestampSchema,
});

const dappSessionRecordSchema = z.object({
	createdAt: timestampSchema,
	expiresAt: timestampSchema.optional(),
	id: dappSessionIdSchema,
	metadata: metadataSchema.optional(),
	origin: z.string().optional(),
	peerName: z.string().optional(),
	scope: z.object({
		accountGroupIds: z.array(accountGroupIdSchema),
		chainAccountIds: z.array(chainAccountIdSchema),
		chains: z.array(chainIdSchema),
		events: z.array(z.string()),
		methods: z.array(z.string()),
	}),
	topic: z.string().optional(),
	transport: z.enum(["injected", "walletconnect"]),
	updatedAt: timestampSchema,
});

const accountModelStateSchema = z.object({
	accountGroups: z.record(accountGroupIdSchema, accountGroupRecordSchema),
	addresses: z.record(addressIdSchema, addressRecordSchema),
	chainAccounts: z.record(chainAccountIdSchema, chainAccountRecordSchema),
	dappSessions: z.record(dappSessionIdSchema, dappSessionRecordSchema),
	keySources: z.record(keySourceIdSchema, keySourceRecordSchema),
	selectedAccountGroupId: accountGroupIdSchema.optional(),
	updatedAt: timestampSchema,
	version: z.literal(1),
	wallets: z.record(walletIdSchema, walletRecordSchema),
});

const secretMaterialRecordSchema = z.object({
	createdAt: timestampSchema,
	encoding: z.literal("utf8"),
	keySourceId: keySourceIdSchema,
	kind: z.enum(["mnemonic", "private-key", "seed"]),
	updatedAt: timestampSchema,
	value: z.string(),
});

const keyManagerStateSchema = z.object({
	accountModel: accountModelStateSchema,
	createdAt: timestampSchema,
	secretMaterials: z.record(keySourceIdSchema, secretMaterialRecordSchema),
	updatedAt: timestampSchema,
	version: z.literal(KEY_MANAGER_STATE_VERSION),
});

export function isKeyManagerState(value: unknown): value is KeyManagerState {
	return keyManagerStateSchema.safeParse(value).success;
}
