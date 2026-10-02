import type { ConfirmationRenderer } from "@/common/Confirmation";
import { WalletUnlockForm } from "@/core/secure-vault/application/wallet-vault/WalletUnlockForm";

import type { WalletUnlockConfirmationData } from "./unlock";
import { isWalletUnlockConfirmationData, WALLET_UNLOCK_CONFIRMATION_KIND } from "./unlock";

type Props = {
	data: WalletUnlockConfirmationData;
	onConfirm: () => void;
	onDecline: () => void;
};

export function WalletUnlockConfirmation({ data, onConfirm, onDecline }: Props) {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">Unlock your wallet</h2>
				<p className="text-muted-foreground mt-1 text-sm break-all">{data.origin}</p>
			</header>
			<div className="flex flex-1 flex-col px-4">
				<WalletUnlockForm
					onUnlocked={onConfirm}
					secondaryAction={{ label: "Cancel", onClick: onDecline }}
				>
					<p className="text-muted-foreground text-sm">
						Your wallet is locked. Enter your password to continue this request. Unlocking does not
						approve the request or grant this dapp access to your accounts.
					</p>
				</WalletUnlockForm>
			</div>
		</div>
	);
}

export const walletUnlockConfirmationRenderer: ConfirmationRenderer = {
	kind: WALLET_UNLOCK_CONFIRMATION_KIND,
	render: ({ request, onConfirm, onDecline }) => {
		if (!isWalletUnlockConfirmationData(request.data)) return null;
		return (
			<WalletUnlockConfirmation data={request.data} onConfirm={onConfirm} onDecline={onDecline} />
		);
	},
};
