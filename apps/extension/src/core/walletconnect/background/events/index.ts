import { areListenersBound, markListenersBound, setLastError, setRelayStatus } from "../state";
import type { WalletKitClient } from "../types";
import { handleSessionProposal } from "./session-proposal";
import { handleSessionRequest } from "./session-request";

export function bindWalletKitListeners(walletKit: WalletKitClient): void {
	if (areListenersBound()) return;

	markListenersBound();

	walletKit.core.relayer.on("relayer_connect", () => {
		setRelayStatus("connected");
	});

	walletKit.core.relayer.on("relayer_disconnect", () => {
		setRelayStatus("disconnected");
	});

	walletKit.on("session_proposal", (proposal) => {
		void handleSessionProposal(walletKit, proposal);
	});

	walletKit.on("session_request", (event) => {
		void handleSessionRequest(walletKit, event);
	});

	walletKit.on("session_delete", () => {
		setLastError(null);
	});

	walletKit.on("proposal_expire", ({ id }) => {
		setLastError(`WalletConnect proposal ${id} expired.`);
	});

	walletKit.on("session_request_expire", ({ id }) => {
		setLastError(`WalletConnect request ${id} expired.`);
	});
}
