import type { WalletKitTypes } from "@reown/walletkit";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";

import { getErrorMessage } from "../../errors";
import { getBackgroundOptions, setLastError } from "../../state";
import type { WalletKitClient } from "../../types";
import { rejectSessionProposal } from "./rejectSessionProposal";
import { resolveSupportedNamespaces } from "./resolveSupportedNamespaces";

export async function handleSessionProposal(
	walletKit: WalletKitClient,
	proposal: WalletKitTypes.SessionProposal,
): Promise<void> {
	try {
		const supportedNamespaces = await resolveSupportedNamespaces(proposal.params);

		if (Object.keys(supportedNamespaces).length === 0) {
			await walletKit.rejectSession({
				id: proposal.id,
				reason: getSdkError("UNSUPPORTED_NAMESPACE_KEY"),
			});
			return;
		}

		const approvedNamespaces = buildApprovedNamespaces({
			proposal: proposal.params,
			supportedNamespaces,
		});
		const peer = proposal.params.proposer.metadata;
		const confirmed = await getBackgroundOptions().confirm?.({
			data: {
				approvedNamespaces,
				proposalId: proposal.id,
				requiredNamespaces: proposal.params.requiredNamespaces,
			},
			message: `${peer.name || "A dapp"} wants to create a WalletConnect session.`,
			title: "Connect dapp?",
		});

		if (!confirmed) {
			await walletKit.rejectSession({
				id: proposal.id,
				reason: getSdkError("USER_REJECTED"),
			});
			return;
		}

		await walletKit.approveSession({
			id: proposal.id,
			namespaces: approvedNamespaces,
		});
		setLastError(null);
	} catch (error) {
		setLastError(getErrorMessage(error));
		await rejectSessionProposal(walletKit, proposal.id);
	}
}
