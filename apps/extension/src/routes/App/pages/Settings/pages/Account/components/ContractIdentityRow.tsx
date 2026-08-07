import { CodeIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { LiquidContractIdentity } from "@/core/chains/liquid/application/contractIdentity";
import { readLiquidContractIdentity } from "@/core/chains/liquid/contractIdentityClient";
import {
	settingsRowClass,
	SettingsRowContent,
} from "@/routes/App/pages/Settings/components/SettingsRow";
import { cn } from "@/theme/utils.ts";
import { UiCopyButton } from "@/ui/UiCopyButton";
import { UiSpinner } from "@/ui/UiSpinner";

/** One value, with what it is for and a way to take it out. */
function Value({ hint, label, value }: { hint: string; label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
					{label}
				</span>
				<UiCopyButton value={value} />
			</div>
			<span className="font-mono text-xs break-all">{value}</span>
			<span className="text-muted-foreground text-xs">{hint}</span>
		</div>
	);
}

/**
 * The address and key that contract actions are signed with.
 *
 * It is a separate row from the wallet's own address on purpose. Contract actions are
 * signed by a single key inside the contract SDK, which funds from that key's own
 * unblinded address and returns change to it — so paying a contract action from any
 * other wallet address produces a transaction that cannot be signed. Until the SDK signs
 * each input at its own path, saying so is more use than hiding it.
 *
 * Nothing here is secret: an address anyone can pay and the public form of one key. It
 * is read on demand rather than with the page because reading it loads the contract
 * module, which is several megabytes.
 */
export function ContractIdentityRow({ accountGroupId }: { accountGroupId: AccountGroupId }) {
	const [identity, setIdentity] = useState<LiquidContractIdentity>();
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(false);

	const read = async () => {
		setLoading(true);
		setError(undefined);

		try {
			setIdentity(await readLiquidContractIdentity(accountGroupId));
		} catch {
			// What a person is told is chosen here, not carried up from wherever it broke. The
			// thrown error's own message is written for whoever is debugging the wallet: it may
			// name a module, a network kind or a derivation path, none of which this reader can
			// act on, and it changes whenever the code below changes. There is exactly one thing
			// they can do about any failure of this read, so that is what it says.
			setError("Could not read the contract identity. Try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<button
				className={cn(settingsRowClass, "hover:bg-accent")}
				disabled={loading}
				onClick={() => void read()}
				type="button"
			>
				<SettingsRowContent
					icon={CodeIcon}
					label="Contract signing identity"
					trailing={loading ? <UiSpinner /> : undefined}
				/>
			</button>

			{error === undefined ? null : <p className="text-destructive px-3 py-2 text-xs">{error}</p>}

			{identity === undefined ? null : (
				<div className="bg-muted/40 mx-3 my-1 rounded-lg py-1">
					<Value
						hint="Fund contract actions from here, unblinded. Change returns to this address."
						label="Contract address"
						value={identity.address}
					/>
					<Value
						hint="Lock a covenant to this wallet with this key — a protocol parameter naming the signer takes it."
						label="Contract public key (x-only)"
						value={identity.schnorrPublicKey}
					/>
					<p className="text-muted-foreground px-3 pt-1 pb-2 text-xs">
						One key signs every contract action, so only what sits at this address can be spent by
						one. This is narrower than the wallet's own balance.
					</p>
				</div>
			)}
		</>
	);
}
