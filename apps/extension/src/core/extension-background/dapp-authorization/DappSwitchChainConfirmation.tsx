import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UiButton } from "@/ui/UiButton/base";

import {
	DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
	type DappSwitchChainConfirmationData,
	isDappSwitchChainConfirmationData,
} from "./connectConfirmation";

type Props = {
	data: DappSwitchChainConfirmationData;
	onConfirm: () => void;
	onDecline: () => void;
};

/**
 * The switch-chain approval. wallet_switchChain widens THIS origin's session to a chain the wallet
 * already knows but hasn't granted this connection yet — a per-connection scope expansion, so the
 * user consents to exposing this account on that chain to the dapp (mirrors the connect grant).
 */
export function DappSwitchChainConfirmation({ data, onConfirm, onDecline }: Props) {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">Use this network?</h2>
				<p className="text-muted-foreground mt-1 text-sm break-all">{data.origin}</p>
			</header>

			<div className="flex-1 space-y-5 overflow-y-auto px-4">
				<p className="text-muted-foreground text-sm">
					This site wants to use another network with your connected account. Approving adds it to
					this site's session.
				</p>

				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
						Network
					</span>
					<span className="text-sm font-medium break-all">{data.chainName}</span>
					<span className="text-muted-foreground font-mono text-xs break-all">{data.chainId}</span>
				</div>
			</div>

			<div className="flex items-center gap-3 p-4 pt-3">
				<UiButton type="button" variant="outline" className="flex-1" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton type="button" className="flex-1" onClick={onConfirm}>
					Use network
				</UiButton>
			</div>
		</div>
	);
}

/** Plugs the switch-chain confirmation into the generic confirmation host (see ConfirmProvider). */
export const dappSwitchChainConfirmationRenderer: ConfirmationRenderer = {
	kind: DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isDappSwitchChainConfirmationData(request.data) ? (
			<DappSwitchChainConfirmation
				data={request.data}
				onConfirm={() => onConfirm()}
				onDecline={onDecline}
			/>
		) : null,
};
