import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import type { ConnectedDappView } from "@/core/dapp-sessions/model";

import { connectedDappKey } from "./useConnectedDapps";

export function ConnectedDappRows({
	dapps,
	isError,
	isLoading,
	row,
}: {
	dapps: ConnectedDappView[];
	isError: boolean;
	isLoading: boolean;
	row: (dapp: ConnectedDappView, key: string) => ReactNode;
}) {
	if (isLoading) {
		return <ListMessage>Loading connected dapps…</ListMessage>;
	}

	if (isError) {
		return <ListMessage>Couldn’t load connected dapps.</ListMessage>;
	}

	if (dapps.length === 0) {
		return (
			<div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
				<HugeiconsIcon className="text-muted-foreground/60" icon={PlugSocketIcon} size={22} />
				<p className="text-muted-foreground text-sm">No connected dapps</p>
				<p className="text-muted-foreground/70 text-xs">
					Dapps you connect to this account appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col">{dapps.map((dapp) => row(dapp, connectedDappKey(dapp)))}</div>
	);
}

function ListMessage({ children }: { children: ReactNode }) {
	return <p className="text-muted-foreground px-3 py-6 text-center text-sm">{children}</p>;
}
