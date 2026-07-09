import { requestBackground } from "@/core/extension-rpc";

import { accountsRpc } from "./model/rpc";
import type {
	AccountsState,
	ActivityPage,
	CreateAccountInput,
	EstimateMaxSendInput,
	EstimateMaxSendResult,
	GetActivityInput,
	ImportAccountInput,
	PortfolioSnapshot,
	ReceiveAddress,
	RecoveryPhrase,
	RemoveAccountInput,
	RemoveWalletInput,
	RenameAccountInput,
	RevealRecoveryPhraseInput,
	SendTransferInput,
	SendTransferResult,
	SetSelectedAccountInput,
	TransferReview,
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

/** Force an immediate re-sync of the selected account's portfolio, bypassing the engine throttle. */
function refreshPortfolio(): Promise<PortfolioSnapshot> {
	return requestBackground<PortfolioSnapshot>(accountsRpc.methods.refreshPortfolio);
}

function getActivity(input: GetActivityInput): Promise<ActivityPage> {
	return requestBackground<ActivityPage>(accountsRpc.methods.getActivity, input);
}

/** Preview a send from the selected account (validate recipient, resolve asset) — no broadcast. */
function inspectTransfer(input: SendTransferInput): Promise<TransferReview> {
	return requestBackground<TransferReview>(accountsRpc.methods.inspectTransfer, input);
}

/** Estimate the max sendable amount (+ assumed L-BTC fee) for an asset on the selected account. */
function estimateMaxSend(input: EstimateMaxSendInput): Promise<EstimateMaxSendResult> {
	return requestBackground<EstimateMaxSendResult>(accountsRpc.methods.estimateMaxSend, input);
}

/** Build, sign, and broadcast a send from the selected account; resolves with the broadcast txid. */
function sendTransfer(input: SendTransferInput): Promise<SendTransferResult> {
	return requestBackground<SendTransferResult>(accountsRpc.methods.sendTransfer, input);
}

function createAccount(input: CreateAccountInput): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.createAccount, input);
}

function importAccount(input: ImportAccountInput): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.importAccount, input);
}

function removeAccount(input: RemoveAccountInput): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.removeAccount, input);
}

function removeWallet(input: RemoveWalletInput): Promise<AccountsState> {
	return requestBackground<AccountsState>(accountsRpc.methods.removeWallet, input);
}

export const accountsClient = {
	createAccount,
	estimateMaxSend,
	getActivity,
	getPortfolio,
	getReceiveAddress,
	getState,
	importAccount,
	inspectTransfer,
	refreshPortfolio,
	removeAccount,
	removeWallet,
	rename,
	revealRecoveryPhrase,
	sendTransfer,
	setSelected,
};
