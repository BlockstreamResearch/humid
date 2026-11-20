import type { ReactNode } from "react";

import type { ConnectedDappView } from "@/core/dapp-sessions/model";
import { cn } from "@/theme/utils.ts";

import { DappAvatar } from "./DappAvatar";

const TRANSPORT_LABEL: Record<ConnectedDappView["transport"], string> = {
	injected: "Injected",
	walletconnect: "WalletConnect",
};

export function DappIdentity({
	className,
	dapp,
	secondary,
}: {
	className?: string;
	dapp: ConnectedDappView;
	secondary?: ReactNode;
}) {
	return (
		<div className={cn("flex min-w-0 items-center gap-2.5", className)}>
			<DappAvatar className="size-8 shrink-0" seed={dapp.url ?? dapp.label} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-sm font-medium">{dapp.label}</span>
				<span className="text-muted-foreground truncate text-xs">
					{TRANSPORT_LABEL[dapp.transport]}
					{secondary ? <> · {secondary}</> : null}
				</span>
			</div>
		</div>
	);
}
