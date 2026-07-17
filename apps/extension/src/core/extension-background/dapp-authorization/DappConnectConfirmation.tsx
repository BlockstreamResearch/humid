import { type FormEvent, useEffect, useState } from "react";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import { LIQUID_WALLET_RPC_METHODS } from "@/core/chains/liquid/domain/LiquidRpc";
import { requestBackground } from "@/core/extension-rpc";
import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { UiButton } from "@/ui/UiButton/base";
import { UiCheckbox } from "@/ui/UiCheckbox";
import { UiField, UiFieldError, UiFieldLabel } from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";

import {
	DAPP_CONNECT_CONFIRMATION_KIND,
	DAPP_CONNECT_LIST_ACCOUNTS_METHOD,
	type DappConnectAccount,
	type DappConnectConfirmationData,
	type DappConnectConfirmationResult,
	isDappConnectConfirmationData,
} from "./connectConfirmation";

/**
 * The methods offered as a "don't ask again" checkbox, in render order. Hand-written on purpose:
 * this modal is the only place that draws the line between a read a user may let a dapp poll and
 * an act it should weigh each time. Every other method a session carries (signing, sending) is
 * deliberately absent — with no checkbox it can never be pre-approved, so it confirms on every
 * call. Absence is the design, not an oversight.
 */
const PRE_APPROVABLE_METHODS: { description: string; id: string; label: string }[] = [
	{
		description: "See this account's asset balances.",
		id: LIQUID_WALLET_RPC_METHODS.GET_BALANCE,
		label: "View balance",
	},
	{
		description: "See this account's individual coins (unspent outputs).",
		id: LIQUID_WALLET_RPC_METHODS.GET_UTXOS,
		label: "View coins",
	},
	{
		description: "See this account's public addresses (its wallet descriptor).",
		id: LIQUID_WALLET_RPC_METHODS.GET_WALLET_DESCRIPTOR,
		label: "View addresses",
	},
	{
		description: "See a public key derived from your identity.",
		id: LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_PUBLIC_KEY,
		label: "View identity key",
	},
];

type Props = {
	data: DappConnectConfirmationData;
	onConfirm: (result: DappConnectConfirmationResult) => void;
	onDecline: () => void;
};

/**
 * The connect modal. When the wallet is locked (`requiresUnlock`), it shows an unlock step first;
 * unlocking loads the account model in the background, after which the same window renders the
 * account + permission approval.
 */
export function DappConnectConfirmation({ data, onConfirm, onDecline }: Props) {
	const [unlocked, setUnlocked] = useState(!data.requiresUnlock);

	if (!unlocked) {
		return (
			<UnlockStep origin={data.origin} onDecline={onDecline} onUnlocked={() => setUnlocked(true)} />
		);
	}

	return <ConnectApproval data={data} onConfirm={onConfirm} onDecline={onDecline} />;
}

function UnlockStep({
	onDecline,
	onUnlocked,
	origin,
}: {
	onDecline: () => void;
	onUnlocked: () => void;
	origin: string;
}) {
	const [passphrase, setPassphrase] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();

		if (!passphrase || pending) return;

		setPending(true);
		setError(null);

		try {
			const status = await walletVaultClient.unlock({ passphrase });

			if (status.isUnlocked) {
				onUnlocked();
			} else {
				setError("Could not unlock the wallet.");
			}
		} catch (unlockError) {
			setError(toErrorMessage(unlockError));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">Unlock to connect</h2>
				<p className="text-muted-foreground mt-1 text-sm break-all">{origin}</p>
			</header>

			<form className="flex flex-1 flex-col gap-4 px-4" onSubmit={handleSubmit}>
				<p className="text-muted-foreground text-sm">
					Your wallet is locked. Enter your password to continue connecting this dapp.
				</p>

				<UiField data-invalid={Boolean(error)}>
					<UiFieldLabel htmlFor="connect-unlock-password">Password</UiFieldLabel>
					<UiInput
						id="connect-unlock-password"
						type="password"
						autoComplete="current-password"
						disabled={pending}
						placeholder="Enter passphrase"
						value={passphrase}
						onChange={(event) => {
							setPassphrase(event.target.value);
							setError(null);
						}}
					/>
					<UiFieldError>{error}</UiFieldError>
				</UiField>

				<div className="mt-auto flex items-center gap-3 py-4">
					<UiButton
						type="button"
						variant="outline"
						className="flex-1"
						disabled={pending}
						onClick={onDecline}
					>
						Decline
					</UiButton>
					<UiButton type="submit" className="flex-1" disabled={!passphrase || pending}>
						{pending ? "Unlocking…" : "Unlock"}
					</UiButton>
				</div>
			</form>
		</div>
	);
}

function ConnectApproval({ data, onConfirm, onDecline }: Props) {
	// A checkbox needs both sides: a method this modal knows how to describe, and one this session
	// actually offers.
	const preApprovable = PRE_APPROVABLE_METHODS.filter((method) => data.methods.includes(method.id));
	// Accounts are passed in when the wallet was already unlocked; otherwise they are loaded here
	// after unlocking (the account list only exists in memory while the vault is unlocked).
	const [accounts, setAccounts] = useState<DappConnectAccount[]>(data.accounts);
	const [accountsError, setAccountsError] = useState<string | null>(null);
	const [loadingAccounts, setLoadingAccounts] = useState(data.accounts.length === 0);
	// Authorization is per account: the current account starts checked; the user can add more.
	const [grantedAccounts, setGrantedAccounts] = useState<Set<string>>(() =>
		defaultGrantedAccounts(data.accounts),
	);
	// Every permission starts off — nothing runs unasked until the user opts in.
	const [grantedMethods, setGrantedMethods] = useState<Set<string>>(() => new Set());

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
					{(() => {
						if (loadingAccounts) {
							return <p className="text-muted-foreground text-sm">Loading accounts…</p>;
						}

						if (accountsError) {
							return <p className="text-sm text-red-500">{accountsError}</p>;
						}

						if (accounts.length === 0) {
							return <p className="text-muted-foreground text-sm">No accounts available.</p>;
						}

						return (
							<ul className="space-y-3">
								{accounts.map((account) => (
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
												{!account.isCurrent && account.isConnected && (
													<span className="text-muted-foreground text-xs">Connected</span>
												)}
											</span>
										</label>
									</li>
								))}
							</ul>
						);
					})()}
				</section>

				<section>
					<h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
						Permissions
					</h3>
					<p className="text-muted-foreground mb-3 text-xs">
						Select what this dapp may do without asking. Anything else it needs will ask for your
						approval each time.
					</p>
					<ul className="space-y-3">
						{preApprovable.map((method) => (
							<li key={method.id}>
								<label
									htmlFor={`connect-perm-${method.id}`}
									className="flex cursor-pointer items-start gap-3"
								>
									<UiCheckbox
										id={`connect-perm-${method.id}`}
										className="mt-0.5"
										checked={grantedMethods.has(method.id)}
										onCheckedChange={(checked) => toggleMethod(method.id, checked === true)}
									/>
									<span className="flex flex-col">
										<span className="text-sm font-medium">{method.label}</span>
										<span className="text-muted-foreground text-xs">{method.description}</span>
									</span>
								</label>
							</li>
						))}
					</ul>
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

function defaultGrantedAccounts(accounts: DappConnectAccount[]): Set<string> {
	// Pre-check the current account AND any the origin's existing session already granted, so a
	// reconnect keeps the previously-authorized accounts instead of silently dropping them.
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
