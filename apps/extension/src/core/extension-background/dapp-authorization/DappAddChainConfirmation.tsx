import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UiButton } from "@/ui/UiButton/base";

import {
	DAPP_ADD_CHAIN_CONFIRMATION_KIND,
	type DappAddChainConfirmationData,
	isDappAddChainConfirmationData,
} from "./connectConfirmation";

type Props = {
	data: DappAddChainConfirmationData;
	onConfirm: () => void;
	onDecline: () => void;
};

/**
 * The add-chain approval. A dapp proposed a new network (wallet_addChain); the wallet mints its OWN
 * id and, ONLY after this explicit approval, persists the chain. The backend URL is surfaced
 * prominently because approving means the wallet will connect to (and trust) that Esplora endpoint —
 * an unvetted URL is the security-sensitive part of the request.
 */
export function DappAddChainConfirmation({ data, onConfirm, onDecline }: Props) {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">Add this network?</h2>
				<p className="text-muted-foreground mt-1 text-sm break-all">{data.origin}</p>
			</header>

			<div className="flex-1 space-y-5 overflow-y-auto px-4">
				<p className="text-muted-foreground text-sm">
					This site wants to add a network to your wallet. Review it carefully — approving lets the
					wallet connect to the backend server below.
				</p>

				<dl className="space-y-3">
					<DetailRow label="Network name" value={data.name} />
					<DetailRow label="Network type" value={data.network} />
					<DetailRow label="Backend URL" value={data.backendUrl} mono />
				</dl>

				<p className="text-xs text-amber-600 dark:text-amber-500">
					Only add networks you trust. The wallet will send blockchain requests to this backend
					server, which can see the addresses it queries.
				</p>
			</div>

			<div className="flex items-center gap-3 p-4 pt-3">
				<UiButton type="button" variant="outline" className="flex-1" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton type="button" className="flex-1" onClick={onConfirm}>
					Add network
				</UiButton>
			</div>
		</div>
	);
}

function DetailRow({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				{label}
			</dt>
			<dd className={`text-sm break-all ${mono ? "font-mono" : "font-medium"}`}>{value}</dd>
		</div>
	);
}

/** Plugs the add-chain confirmation into the generic confirmation host (see ConfirmProvider). */
export const dappAddChainConfirmationRenderer: ConfirmationRenderer = {
	kind: DAPP_ADD_CHAIN_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isDappAddChainConfirmationData(request.data) ? (
			<DappAddChainConfirmation
				data={request.data}
				onConfirm={() => onConfirm()}
				onDecline={onDecline}
			/>
		) : null,
};
