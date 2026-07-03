import type { ChainId } from "@/core/chains/application/ChainRecord";

export type KeySourceId = `key-source:${string}`;
export type WalletId = `wallet:${string}`;
export type AccountGroupId = `account-group:${string}`;
export type ChainAccountId = `chain-account:${string}`;
export type AddressId = `address:${string}`;
export type DappSessionId = `dapp-session:${string}`;

export type { ChainId };
export type AccountIdentifier = `${ChainId}:${string}`;
