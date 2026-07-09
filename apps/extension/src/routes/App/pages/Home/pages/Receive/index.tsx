import { UiSpinner } from "@/ui/UiSpinner";

import { useHome } from "../../HomeContext";
import { ReceiveView } from "./components/ReceiveView";
import { useReceiveAddress } from "./useReceiveAddress";

/**
 * Receive tab: derives the account's receive address for the selected chain (LWK, on
 * demand) and shows it as a QR + copyable string. Reached from the Receive action.
 */
export function ReceivePage() {
	const { accountGroup, chain } = useHome();
	const query = useReceiveAddress({ accountGroupId: accountGroup.id, chainId: chain.id });

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
		/>
	);
}
