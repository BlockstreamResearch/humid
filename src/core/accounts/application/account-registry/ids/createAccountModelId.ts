import type {
	AccountGroupId,
	AddressId,
	ChainAccountId,
	DappSessionId,
	KeySourceId,
	WalletId,
} from "../model/identifiers";

export function createAccountGroupId(): AccountGroupId {
	return `account-group:${crypto.randomUUID()}`;
}

export function createAddressId(): AddressId {
	return `address:${crypto.randomUUID()}`;
}

export function createChainAccountId(): ChainAccountId {
	return `chain-account:${crypto.randomUUID()}`;
}

export function createDappSessionId(): DappSessionId {
	return `dapp-session:${crypto.randomUUID()}`;
}

export function createKeySourceId(): KeySourceId {
	return `key-source:${crypto.randomUUID()}`;
}

export function createWalletId(): WalletId {
	return `wallet:${crypto.randomUUID()}`;
}
