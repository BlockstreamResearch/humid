import { requestBackground } from "@/core/extension-rpc";

import { accountsRpc } from "./model/rpc";
import type {
	AccountsState,
	PortfolioSnapshot,
	ReceiveAddress,
	RecoveryPhrase,
	RenameAccountInput,
	RevealRecoveryPhraseInput,
	SetSelectedAccountInput,
} from "./model/types";

function getState(): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.getState);
}

function setSelected(input: SetSelectedAccountInput): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.setSelected, input);
}

function rename(input: RenameAccountInput): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.rename, input);
}

function revealRecoveryPhrase(input: RevealRecoveryPhraseInput): Promise<RecoveryPhrase> {
	return requestBackground<RecoveryPhrase>(accountsRpc.methods.revealRecoveryPhrase, input);
}

function getReceiveAddress(): Promise<ReceiveAddress> {
	return requestBackground<ReceiveAddress>(accountsRpc.methods.getReceiveAddress);
}

function getPortfolio(): Promise<PortfolioSnapshot> {
	return requestBackground<PortfolioSnapshot>(accountsRpc.methods.getPortfolio);
}

export const accountsClient = {
	getPortfolio,
	getReceiveAddress,
	getState,
	rename,
	revealRecoveryPhrase,
	setSelected,
};
