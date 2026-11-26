import { useEffect, useState } from "react";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import {
	ConfirmationActions,
	ConfirmationLayout,
	hostOf,
} from "@/common/Confirmation/ConfirmationLayout";
import { ConfirmationSection } from "@/common/Confirmation/ConfirmationParts";
import { requestBackground } from "@/core/extension-rpc";
import { cn } from "@/theme/utils.ts";
import { UiCheckbox } from "@/ui/UiCheckbox";

import type {
	DappConnectAccount,
	DappConnectConfirmationData,
	DappConnectConfirmationResult,
} from "./connectConfirmation";
import {
	DAPP_CONNECT_CONFIRMATION_KIND,
	DAPP_CONNECT_LIST_ACCOUNTS_METHOD,
	isDappConnectConfirmationData,
} from "./connectConfirmation";
import { PRE_APPROVABLE_METHODS } from "./methodPolicyPresentation";

type Props = {
	data: DappConnectConfirmationData;
	onConfirm: (result: DappConnectConfirmationResult) => void;
	onDecline: () => void;
};

export function DappConnectConfirmation({ data, onConfirm, onDecline }: Props) {
	const preApprovable = PRE_APPROVABLE_METHODS.filter((method) => data.methods.includes(method.id));
	const [accounts, setAccounts] = useState<DappConnectAccount[]>(data.accounts);
	const [accountsError, setAccountsError] = useState<string | null>(null);
	const [loadingAccounts, setLoadingAccounts] = useState(data.accounts.length === 0);
	const [grantedAccounts, setGrantedAccounts] = useState<Set<string>>(() =>
		defaultGrantedAccounts(data.accounts),
	);
	const [grantedMethods, setGrantedMethods] = useState<Set<string>>(
		() => new Set(preApprovable.map((method) => method.id)),
	);

	useEffect(() => {
		if (data.accounts.length > 0) return;

		let active = true;

		requestBackground<DappConnectAccount[]>(DAPP_CONNECT_LIST_ACCOUNTS_METHOD)
			.then((fetched) => {
				if (!active) return;

				setAccounts(fetched);
				setGrantedAccounts(defaultGrantedAccounts(fetched));
				setLoadingAccounts(false);
			})
			.catch((error) => {
				if (!active) return;

				setAccountsError(toErrorMessage(error));
				setLoadingAccounts(false);
			});

		return () => {
			active = false;
		};
	}, [data.accounts.length]);

	const toggleAccount = (id: string, checked: boolean) => {
		setGrantedAccounts((current) => withToggle(current, id, checked));
	};

	const toggleMethod = (id: string, checked: boolean) => {
		setGrantedMethods((current) => withToggle(current, id, checked));
	};

	return (
		<ConfirmationLayout
			origin={data.origin}
			network={data.networks.join(", ")}
			title={`Connect to ${hostOf(data.origin)}`}
			statement="The dapp sees the accounts you choose. Every payment and signature still needs approval."
			footer={
				<ConfirmationActions
					confirmLabel="Connect"
					canConfirm={grantedAccounts.size > 0}
					onReject={onDecline}
					onConfirm={() =>
						onConfirm({
							grantedAccountGroupIds: [...grantedAccounts],
							grantedMethods: [...grantedMethods],
						})
					}
				/>
			}
		>
			<ConfirmationSection title="Accounts">
				{loadingAccounts && <SectionMessage>Loading accounts…</SectionMessage>}
				{accountsError !== null && (
					<SectionMessage className="text-destructive">{accountsError}</SectionMessage>
				)}
				{!loadingAccounts && accountsError === null && accounts.length === 0 && (
					<SectionMessage>No accounts available.</SectionMessage>
				)}
				{accounts.map((account) => (
					<CheckRow
						key={account.id}
						id={`connect-account-${account.id}`}
						label={account.name}
						aside={accountTag(account)}
						checked={grantedAccounts.has(account.id)}
						onCheckedChange={(checked) => toggleAccount(account.id, checked)}
					/>
				))}
			</ConfirmationSection>
			{preApprovable.length > 0 && (
				<ConfirmationSection title="Allow without asking">
					{preApprovable.map((method) => (
						<CheckRow
							key={method.id}
							id={`connect-perm-${method.id}`}
							label={method.label}
							note={method.description}
							checked={grantedMethods.has(method.id)}
							onCheckedChange={(checked) => toggleMethod(method.id, checked)}
						/>
					))}
				</ConfirmationSection>
			)}
		</ConfirmationLayout>
	);
}

function CheckRow({
	id,
	label,
	note,
	aside,
	checked,
	onCheckedChange,
}: {
	id: string;
	label: string;
	note?: string;
	aside?: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<label
			htmlFor={id}
			className="border-border/60 flex cursor-pointer items-start gap-2.5 border-t py-2.5 first-of-type:border-t-0"
		>
			<UiCheckbox
				id={id}
				className="mt-0.5"
				checked={checked}
				onCheckedChange={(next) => onCheckedChange(next === true)}
			/>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-sm font-semibold">{label}</span>
				{note !== undefined && <span className="text-muted-foreground text-xs">{note}</span>}
			</span>
			{aside !== undefined && <span className="text-muted-foreground text-xs">{aside}</span>}
		</label>
	);
}

function SectionMessage({ className, children }: { className?: string; children: string }) {
	return <p className={cn("text-muted-foreground py-2.5 text-sm", className)}>{children}</p>;
}

function accountTag(account: DappConnectAccount): string | undefined {
	if (account.isCurrent) return "Current";
	if (account.isConnected) return "Connected";
	return undefined;
}

export const dappConnectConfirmationRenderer: ConfirmationRenderer = {
	kind: DAPP_CONNECT_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isDappConnectConfirmationData(request.data) ? (
			<DappConnectConfirmation data={request.data} onConfirm={onConfirm} onDecline={onDecline} />
		) : null,
};

function defaultGrantedAccounts(accounts: DappConnectAccount[]): Set<string> {
	return new Set(
		accounts
			.filter((account) => account.isCurrent || account.isConnected)
			.map((account) => account.id),
	);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function withToggle(current: Set<string>, id: string, checked: boolean): Set<string> {
	const next = new Set(current);

	if (checked) {
		next.add(id);
	} else {
		next.delete(id);
	}

	return next;
}
