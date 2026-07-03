import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { ConnectedDappsList, useConnectedDapps } from "@/routes/App/components/ConnectedDapps";
import { UiScrollArea } from "@/ui/UiScrollArea";

/** Per-account connected-dapps screen: breadcrumb back to the account + the account-scoped dapp list. */
export function ConnectedDappsView({
	accountGroupId,
	accountName,
}: {
	accountGroupId: AccountGroupId;
	accountName: string;
}) {
	const { dapps, isError, isLoading, revoke, revokingKey } = useConnectedDapps(accountGroupId);

	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to account"
					className="text-muted-foreground hover:text-foreground shrink-0"
					params={{ accountGroupId }}
					to="/app/settings/account/$accountGroupId"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<AccountAvatar className="size-5 shrink-0" seed={accountGroupId} />
				<span className="max-w-32 truncate text-sm font-semibold">{accountName}</span>
				<span className="text-muted-foreground/50 shrink-0 text-sm">/</span>
				<span className="text-muted-foreground shrink-0 text-sm">Connected dapps</span>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="px-3 py-3">
					<ConnectedDappsList
						dapps={dapps}
						isError={isError}
						isLoading={isLoading}
						onRevoke={revoke}
						revokingKey={revokingKey}
					/>
				</div>
			</UiScrollArea>
		</div>
	);
}
