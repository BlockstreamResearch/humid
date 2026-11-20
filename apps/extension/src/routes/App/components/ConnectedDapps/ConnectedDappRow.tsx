import type { ConnectedDappView } from "@/core/dapp-sessions/model";
import { UiButton } from "@/ui/UiButton/base";

import { DappIdentity } from "./DappIdentity";

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function ConnectedDappRow({
	dapp,
	isRevoking,
	onRevoke,
}: {
	dapp: ConnectedDappView;
	isRevoking: boolean;
	onRevoke: () => void;
}) {
	return (
		<div className="flex items-center gap-2.5 rounded-lg px-1.5 py-2">
			<DappIdentity
				className="flex-1"
				dapp={dapp}
				secondary={`${pluralize(dapp.methods.length, "method")} · ${pluralize(dapp.chains.length, "network")}`}
			/>
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
