import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ConnectedDappsList, useConnectedDapps } from "@/routes/App/components/ConnectedDapps";
import { useHome } from "@/routes/App/pages/Home/HomeContext";
import {
	UiDropdownMenu,
	UiDropdownMenuContent,
	UiDropdownMenuSeparator,
	UiDropdownMenuTrigger,
} from "@/ui/UiDropdownMenu";

/**
 * Header trigger (next to the account switcher) opening the dapps connected to the selected account,
 * MetaMask-style. Disconnecting drops just this account from the dapp's grant. The badge counts the
 * selected account's connections.
 */
export function ConnectedDappsMenu() {
	const { accountGroup } = useHome();
	const { dapps, isError, isLoading, revoke, revokingKey } = useConnectedDapps(accountGroup?.id);
	const count = dapps.length;

	return (
		<UiDropdownMenu>
			<UiDropdownMenuTrigger
				aria-label={`Connected dapps (${count})`}
				className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring relative flex size-8 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				<HugeiconsIcon icon={PlugSocketIcon} size={18} />
				{count > 0 ? (
					<span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold">
						{count}
					</span>
				) : null}
			</UiDropdownMenuTrigger>
			<UiDropdownMenuContent align="end" className="min-w-72 p-0">
				<div className="px-3 py-2 text-sm font-medium">Connected dapps</div>
				<UiDropdownMenuSeparator className="mx-0" />
				<div className="max-h-80 overflow-y-auto p-1">
					<ConnectedDappsList
						dapps={dapps}
						isError={isError}
						isLoading={isLoading}
						onRevoke={revoke}
						revokingKey={revokingKey}
					/>
				</div>
			</UiDropdownMenuContent>
		</UiDropdownMenu>
	);
}
