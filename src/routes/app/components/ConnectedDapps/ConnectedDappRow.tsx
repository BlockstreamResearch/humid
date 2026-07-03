import type { ConnectedDappView } from "@/core/dapp-sessions/model";
import { UiBadge } from "@/ui/UiBadge";
import { UiButton } from "@/ui/UiButton/base";

import { DappAvatar } from "./DappAvatar";

const TRANSPORT_LABEL: Record<ConnectedDappView["transport"], string> = {
	injected: "Injected",
	walletconnect: "WalletConnect",
};

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One connected dapp: identity + transport + granted-scope summary + a per-account disconnect. */
export function ConnectedDappRow({
	dapp,
	isRevoking,
	onRevoke,
}: {
	dapp: ConnectedDappView;
	isRevoking: boolean;
	onRevoke: () => void;
}) {
	const scopeSummary = [
		pluralize(dapp.methods.length, "method"),
		pluralize(dapp.chains.length, "chain"),
	].join(" · ");

	return (
		<div className="flex items-center gap-2.5 rounded-lg px-1.5 py-2">
			<DappAvatar className="size-8 shrink-0" seed={dapp.url ?? dapp.label} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">{dapp.label}</span>
					<UiBadge className="shrink-0" variant="secondary">
						{TRANSPORT_LABEL[dapp.transport]}
					</UiBadge>
				</div>
				<span className="text-muted-foreground truncate text-xs">{scopeSummary}</span>
			</div>
			<UiButton
				aria-label={`Disconnect ${dapp.label}`}
				className="shrink-0"
				disabled={isRevoking}
				onClick={onRevoke}
				size="sm"
				variant="outline"
			>
				{isRevoking ? "Disconnecting…" : "Disconnect"}
			</UiButton>
		</div>
	);
}
