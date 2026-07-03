import { useMemo, useState } from "react";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import {
	WALLET_CAPABILITY_GROUPS,
	type WalletCapabilityDescriptor,
	type WalletCapabilityGroup,
} from "@/core/wallet-methods/capability";
import { UiButton } from "@/ui/UiButton/base";
import { UiCheckbox } from "@/ui/UiCheckbox";

import {
	DAPP_CONNECT_CONFIRMATION_KIND,
	type DappConnectConfirmationData,
	type DappConnectConfirmationResult,
	isDappConnectConfirmationData,
} from "./connectConfirmation";

// Section order + headers for the permission groups (iOS-style grouping of the
// per-method checkboxes). UI copy lives here; the ids come from the capability layer.
const GROUP_SECTIONS: { group: WalletCapabilityGroup; title: string }[] = [
	{ group: WALLET_CAPABILITY_GROUPS.VIEW_BALANCES, title: "View balances" },
	{ group: WALLET_CAPABILITY_GROUPS.VIEW_ADDRESSES, title: "View addresses" },
	{ group: WALLET_CAPABILITY_GROUPS.SIGN_MESSAGES, title: "Sign messages" },
	{ group: WALLET_CAPABILITY_GROUPS.SIGN_TRANSACTIONS, title: "Sign transactions" },
	{ group: WALLET_CAPABILITY_GROUPS.SEND_FUNDS, title: "Send funds" },
	{ group: WALLET_CAPABILITY_GROUPS.IDENTITY, title: "Identity" },
	{ group: WALLET_CAPABILITY_GROUPS.ADVANCED, title: "Advanced" },
];

type Props = {
	data: DappConnectConfirmationData;
	onConfirm: (result: DappConnectConfirmationResult) => void;
	onDecline: () => void;
};

export function DappConnectConfirmation({ data, onConfirm, onDecline }: Props) {
	const sections = useMemo(() => groupCapabilities(data.capabilities), [data.capabilities]);
	// Authorization is per account: the current account starts checked; the user can add more.
	const [grantedAccounts, setGrantedAccounts] = useState<Set<string>>(
		() =>
			new Set(data.accounts.filter((account) => account.isCurrent).map((account) => account.id)),
	);
	// Requested permissions start checked; the user reviews and unchecks what to withhold.
	const [grantedMethods, setGrantedMethods] = useState<Set<string>>(
		() => new Set(data.capabilities.map((capability) => capability.id)),
	);

	const toggleAccount = (id: string, checked: boolean) => {
		setGrantedAccounts((current) => withToggle(current, id, checked));
	};

	const toggleMethod = (id: string, checked: boolean) => {
		setGrantedMethods((current) => withToggle(current, id, checked));
	};

	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">Connect this dapp?</h2>
				<p className="text-muted-foreground mt-1 text-sm break-all">{data.origin}</p>
			</header>

			<div className="flex-1 space-y-5 overflow-y-auto px-4">
				<section>
					<h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
						Accounts
					</h3>
					<ul className="space-y-3">
						{data.accounts.map((account) => (
							<li key={account.id}>
								<label
									htmlFor={`connect-account-${account.id}`}
									className="flex cursor-pointer items-center gap-3"
								>
									<UiCheckbox
										id={`connect-account-${account.id}`}
										checked={grantedAccounts.has(account.id)}
										onCheckedChange={(checked) => toggleAccount(account.id, checked === true)}
									/>
									<span className="flex flex-1 items-center justify-between gap-2">
										<span className="text-sm font-medium">{account.name}</span>
										{account.isCurrent && (
											<span className="text-muted-foreground text-xs">Current</span>
										)}
									</span>
								</label>
							</li>
						))}
					</ul>
				</section>

				<section>
					<h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
						Permissions
					</h3>
					<p className="text-muted-foreground mb-3 text-xs">
						Choose what this dapp may access. Unselected permissions are withheld — reads return a
						restricted response and actions are refused.
					</p>
					<div className="space-y-4">
						{sections.map((section) => (
							<div key={section.group}>
								<h4 className="text-muted-foreground/80 mb-2 text-[0.7rem] font-medium tracking-wide uppercase">
									{section.title}
								</h4>
								<ul className="space-y-3">
									{section.capabilities.map((capability) => (
										<li key={capability.id}>
											<label
												htmlFor={`connect-perm-${capability.id}`}
												className="flex cursor-pointer items-start gap-3"
											>
												<UiCheckbox
													id={`connect-perm-${capability.id}`}
													className="mt-0.5"
													checked={grantedMethods.has(capability.id)}
													onCheckedChange={(checked) =>
														toggleMethod(capability.id, checked === true)
													}
												/>
												<span className="flex flex-col">
													<span className="text-sm font-medium">{capability.label}</span>
													<span className="text-muted-foreground text-xs">
														{capability.description}
													</span>
												</span>
											</label>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</section>
			</div>

			<div className="flex items-center gap-3 p-4 pt-3">
				<UiButton type="button" variant="outline" className="flex-1" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton
					type="button"
					className="flex-1"
					disabled={grantedAccounts.size === 0}
					onClick={() =>
						onConfirm({
							grantedAccountGroupIds: [...grantedAccounts],
							grantedMethods: [...grantedMethods],
						})
					}
				>
					Connect
				</UiButton>
			</div>
		</div>
	);
}

/** Plugs the connect confirmation into the generic confirmation host (see ConfirmProvider). */
export const dappConnectConfirmationRenderer: ConfirmationRenderer = {
	kind: DAPP_CONNECT_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isDappConnectConfirmationData(request.data) ? (
			<DappConnectConfirmation data={request.data} onConfirm={onConfirm} onDecline={onDecline} />
		) : null,
};

function withToggle(current: Set<string>, id: string, checked: boolean): Set<string> {
	const next = new Set(current);

	if (checked) {
		next.add(id);
	} else {
		next.delete(id);
	}

	return next;
}

function groupCapabilities(capabilities: WalletCapabilityDescriptor[]) {
	return GROUP_SECTIONS.map(({ group, title }) => ({
		capabilities: capabilities.filter((capability) => capability.group === group),
		group,
		title,
	})).filter((section) => section.capabilities.length > 0);
}
