import type { ConfirmationDecision, ConfirmationRequest } from "@/helpers/background";

import { dappAuthorizationErrors } from "../dapp-authorization/errors";

export const WALLET_UNLOCK_CONFIRMATION_KIND = "wallet-unlock";

export type WalletUnlockConfirmationData = {
	kind: typeof WALLET_UNLOCK_CONFIRMATION_KIND;
	origin: string;
};

export function isWalletUnlockConfirmationData(
	data: unknown,
): data is WalletUnlockConfirmationData {
	if (typeof data !== "object" || data === null) return false;
	return (
		"kind" in data &&
		data.kind === WALLET_UNLOCK_CONFIRMATION_KIND &&
		"origin" in data &&
		typeof data.origin === "string"
	);
}

export function createWalletUnlockRequester({
	confirm,
	isUnlocked,
}: {
	confirm: (request: ConfirmationRequest) => Promise<ConfirmationDecision>;
	isUnlocked: () => boolean;
}): (origin: string) => Promise<void> {
	return async (origin) => {
		if (isUnlocked()) return;

		const decision = await confirm({
			title: "Unlock your wallet",
			message: origin,
			data: {
				kind: WALLET_UNLOCK_CONFIRMATION_KIND,
				origin,
			} satisfies WalletUnlockConfirmationData,
		});

		if (!decision.approved) {
			throw dappAuthorizationErrors.userRejected(
				decision.reason === "timeout"
					? "The unlock request timed out."
					: decision.reason === "superseded"
						? "The unlock request was cancelled by another wallet request."
						: "User cancelled the unlock request.",
				{ reason: decision.reason ?? "user_rejected" },
			);
		}

		if (!isUnlocked()) {
			throw dappAuthorizationErrors.walletLocked(
				"The wallet is still locked. Unlock it to continue.",
			);
		}
	};
}
