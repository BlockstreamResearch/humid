import { ArrowLeft01Icon, ArrowRight01Icon, PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { ConnectedDappView } from "@/core/dapp-sessions/model";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { connectedDappKey, DappIdentity } from "@/routes/App/components/ConnectedDapps";
import { UiScrollArea } from "@/ui/UiScrollArea";

/** Per-account connected-dapps screen: breadcrumb back to the account + navigable per-dapp rows. */
export function ConnectedDappsListView({
	accountGroupId,
	accountName,
	dapps,
	isError,
	isLoading,
}: {
	accountGroupId: AccountGroupId;
	accountName: string;
	dapps: ConnectedDappView[];
	isError: boolean;
	isLoading: boolean;
}) {
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
					<DappRows
						accountGroupId={accountGroupId}
						dapps={dapps}
						isError={isError}
						isLoading={isLoading}
					/>
				</div>
			</UiScrollArea>
		</div>
	);
}

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The ordered waterfall (loading → error → empty → data); each dapp opens its per-method policy. */
function DappRows({
	accountGroupId,
	dapps,
	isError,
	isLoading,
}: {
	accountGroupId: AccountGroupId;
	dapps: ConnectedDappView[];
	isError: boolean;
	isLoading: boolean;
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
		<div className="flex flex-col">
			{dapps.map((dapp) => {
				const key = connectedDappKey(dapp);
				const scope = [
					pluralize(dapp.methods.length, "method"),
					pluralize(dapp.chains.length, "chain"),
				].join(" · ");

				return (
					<Link
						key={key}
						className="hover:bg-accent flex items-center gap-2 rounded-lg px-1.5 py-2 transition-colors"
						params={{ accountGroupId, dappKey: key }}
						to="/app/settings/account/$accountGroupId/connected-dapps/$dappKey"
					>
						<DappIdentity className="flex-1" dapp={dapp} secondary={scope} />
						<HugeiconsIcon
							className="text-muted-foreground/60 shrink-0"
							icon={ArrowRight01Icon}
							size={16}
						/>
					</Link>
				);
			})}
		</div>
	);
}

function ListMessage({ children }: { children: ReactNode }) {
	return <p className="text-muted-foreground px-3 py-6 text-center text-sm">{children}</p>;
}
