import { useState } from "react";

import { UiSpinner } from "@/ui/UiSpinner";

import { useHome } from "../../HomeContext";
import { ReceiveView } from "./components/ReceiveView";
import { useContractIdentity } from "./useContractIdentity";
import { useReceiveAddress } from "./useReceiveAddress";

/**
 * Receive tab: derives the account's confidential address for the selected chain (LWK, on
 * demand) and shows it as a QR + copyable string, beside the unconfidential address and the
 * key contract actions are signed with. Reached from the Receive action.
 */
export function ReceivePage() {
	const { accountGroup, chain } = useHome();
	const query = useReceiveAddress({ accountGroupId: accountGroup.id, chainId: chain.id });
	const [contractOpened, setContractOpened] = useState(false);
	const identity = useContractIdentity({
		accountGroupId: accountGroup.id,
		// Named here rather than left to the background's own selection: the background reads the
		// selected chain either way, and what this decides is which cached answer is this one.
		chainId: chain.id,
		enabled: contractOpened,
	});

	if (query.isPending) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	if (query.isError || !query.data) {
		const detail = query.error instanceof Error ? query.error.message : null;

		return (
			<div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
				<p>Couldn&apos;t derive a receive address. Try again.</p>
				{detail ? <p className="text-destructive/80 text-xs break-words">{detail}</p> : null}
			</div>
		);
	}

	return (
		<ReceiveView
			address={query.data.address}
			accountName={accountGroup.name}
			chainName={chain.name}
			contractIdentity={identity.data}
			// What a person is told is chosen here rather than carried up from wherever it broke:
			// the thrown message names a module, a network kind or a derivation path, and there is
			// exactly one thing they can do about any failure of this read.
			contractError={
				identity.isError ? "Could not read the contract identity. Try again." : undefined
			}
			onContractOpened={() => setContractOpened(true)}
		/>
	);
}
