import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { Page } from "@/common/Page";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { ConnectedDappView } from "@/core/dapp-sessions/model";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { ConnectedDappRows, DappIdentity } from "@/routes/App/components/ConnectedDapps";

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
		<Page
			back={{
				label: "Back to account",
				params: { accountGroupId },
				to: "/app/settings/account/$accountGroupId",
			}}
			title={
				<>
					<AccountAvatar className="size-5 shrink-0" seed={accountGroupId} />
					<span className="max-w-32 truncate text-sm font-semibold">{accountName}</span>
					<span className="text-muted-foreground/50 shrink-0 text-sm">/</span>
					<span className="text-muted-foreground shrink-0 text-sm">Connected dapps</span>
				</>
			}
		>
			<div className="px-3 py-3">
				<DappRows
					accountGroupId={accountGroupId}
					dapps={dapps}
					isError={isError}
					isLoading={isLoading}
				/>
			</div>
		</Page>
	);
}

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function DappRows({
	accountGroupId,
	...rows
}: {
	accountGroupId: AccountGroupId;
	dapps: ConnectedDappView[];
	isError: boolean;
	isLoading: boolean;
}) {
	return (
		<ConnectedDappRows
			{...rows}
			row={(dapp, key) => (
				<Link
					key={key}
					className="hover:bg-accent flex items-center gap-2 rounded-lg px-2 py-2 transition-colors"
					params={{ accountGroupId, dappKey: key }}
					to="/app/settings/account/$accountGroupId/connected-dapps/$dappKey"
				>
					<DappIdentity
						className="flex-1"
						dapp={dapp}
						secondary={[
							pluralize(dapp.methods.length, "method"),
							pluralize(dapp.chains.length, "network"),
						].join(" · ")}
					/>
					<HugeiconsIcon
						className="text-muted-foreground/60 shrink-0"
						icon={ArrowRight01Icon}
						size={16}
					/>
				</Link>
			)}
		/>
	);
}
