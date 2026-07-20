import { ArrowLeft01Icon, SquareLock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { ConnectedDappView } from "@/core/dapp-sessions/model";
import { WALLET_METHOD_PRESENTATION } from "@/core/extension-background/dapp-authorization/methodPolicyPresentation";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { DappIdentity } from "@/routes/App/components/ConnectedDapps";
import { UiBadge } from "@/ui/UiBadge";
import { UiButton } from "@/ui/UiButton/base";
import { UiScrollArea } from "@/ui/UiScrollArea";
import { UiSwitch } from "@/ui/UiSwitch";

type ConnectedDappItemViewProps = {
	accountGroupId: AccountGroupId;
	accountName: string;
	dapp: ConnectedDappView;
	isRevoking: boolean;
	onRevoke: () => void;
	onToggleMethod: (method: string, silent: boolean) => void;
	settingMethod: string | null;
};

/**
 * Per-dapp policy shell: breadcrumb + identity + Disconnect, then the per-method policy. An injected
 * dapp's reads can be flipped to run without a prompt; its writes are locked to "Always asks", the
 * safety invariant. A WalletConnect dapp has no configurable policy and confirms every call.
 */
export function ConnectedDappItemView({
	accountGroupId,
	accountName,
	dapp,
	isRevoking,
	onRevoke,
	onToggleMethod,
	settingMethod,
}: ConnectedDappItemViewProps) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to connected dapps"
					className="text-muted-foreground hover:text-foreground shrink-0"
					params={{ accountGroupId }}
					to="/app/settings/account/$accountGroupId/connected-dapps"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<AccountAvatar className="size-5 shrink-0" seed={accountGroupId} />
				<span className="max-w-24 shrink-0 truncate text-sm font-semibold">{accountName}</span>
				<span className="text-muted-foreground/50 shrink-0 text-sm">/</span>
				<span className="text-muted-foreground min-w-0 truncate text-sm">{dapp.label}</span>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-3 py-4">
					<div className="flex items-center gap-2.5">
						<DappIdentity className="flex-1" dapp={dapp} secondary={dapp.url} />
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

					{dapp.transport === "walletconnect" ? (
						<WalletConnectPolicyNote />
					) : (
						<MethodPolicy
							dapp={dapp}
							onToggleMethod={onToggleMethod}
							settingMethod={settingMethod}
						/>
					)}
				</div>
			</UiScrollArea>
		</div>
	);
}

/** The injected dapp's method surface: reads as run-without-asking toggles, writes locked to "Always asks". */
function MethodPolicy({
	dapp,
	onToggleMethod,
	settingMethod,
}: {
	dapp: ConnectedDappView;
	onToggleMethod: (method: string, silent: boolean) => void;
	settingMethod: string | null;
}) {
	const surface = new Set(dapp.methods);
	const reads = WALLET_METHOD_PRESENTATION.filter(
		(method) => method.preApprovable && surface.has(method.id),
	);
	const writes = WALLET_METHOD_PRESENTATION.filter(
		(method) => !method.preApprovable && surface.has(method.id),
	);

	return (
		<>
			{reads.length > 0 ? (
				<section className="flex flex-col gap-3">
					<div className="flex flex-col gap-0.5">
						<h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Runs without asking
						</h3>
						<p className="text-muted-foreground/80 text-xs">
							Let this dapp run a read without a prompt. Turn any off to confirm it each time.
						</p>
					</div>
					<ul className="flex flex-col gap-3.5">
						{reads.map((method) => (
							<li key={method.id} className="flex items-start justify-between gap-3">
								<div className="flex min-w-0 flex-col">
									<span className="text-sm font-medium">{method.label}</span>
									<span className="text-muted-foreground text-xs">{method.description}</span>
								</div>
								<UiSwitch
									aria-label={`Run ${method.label} without asking`}
									checked={dapp.methodPolicy[method.id] === true}
									className="mt-0.5 shrink-0"
									disabled={settingMethod === method.id}
									onCheckedChange={(checked) => onToggleMethod(method.id, checked)}
								/>
							</li>
						))}
					</ul>
				</section>
			) : null}

			{writes.length > 0 ? (
				<section className="flex flex-col gap-3">
					<div className="flex flex-col gap-0.5">
						<h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Always asks
						</h3>
						<p className="text-muted-foreground/80 text-xs">
							These need your approval on every call and can’t be pre-approved.
						</p>
					</div>
					<ul className="flex flex-col gap-3.5">
						{writes.map((method) => (
							<li key={method.id} className="flex items-start justify-between gap-3">
								<div className="flex min-w-0 items-start gap-2">
									<HugeiconsIcon
										className="text-muted-foreground/60 mt-0.5 shrink-0"
										icon={SquareLock01Icon}
										size={15}
									/>
									<div className="flex min-w-0 flex-col">
										<span className="text-sm font-medium">{method.label}</span>
										<span className="text-muted-foreground text-xs">{method.description}</span>
									</div>
								</div>
								<UiBadge className="mt-0.5 shrink-0" variant="secondary">
									Always asks
								</UiBadge>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</>
	);
}

/** WalletConnect has no per-method policy — every call is confirmed, so there is nothing to toggle. */
function WalletConnectPolicyNote() {
	return (
		<div className="border-border/60 bg-muted/30 rounded-lg border p-3">
			<p className="text-muted-foreground text-xs">
				WalletConnect confirms every call; per-method permissions aren’t configurable here.
			</p>
		</div>
	);
}
