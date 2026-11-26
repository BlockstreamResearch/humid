import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UNLOCK_CONFIRMATION_KIND } from "@/core/secure-vault/application/wallet-vault/unlockConfirmation";
import { UiButton } from "@/ui/UiButton/base";

import { UnlockScreen, useWalletUnlock } from "./WalletUnlock";

export function UnlockConfirmation({ onReject }: { onReject: () => void }) {
	const unlock = useWalletUnlock();

	return (
		<UnlockScreen
			unlock={unlock}
			title="Unlock to continue"
			statement="The wallet is locked. Unlock the wallet to review the dapp's request."
			disabled={unlock.isPending}
			secondary={
				<UiButton type="button" variant="outline" onClick={onReject}>
					Reject
				</UiButton>
			}
		/>
	);
}

// The background advances the queue when the wallet unlocks, so a successful unlock needs no response.
export const unlockConfirmationRenderer: ConfirmationRenderer = {
	kind: UNLOCK_CONFIRMATION_KIND,
	render: ({ onDecline }) => <UnlockConfirmation onReject={onDecline} />,
};
