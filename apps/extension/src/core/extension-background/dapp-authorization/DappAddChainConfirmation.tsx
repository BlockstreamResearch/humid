import type { ConfirmationRenderer } from "@/common/Confirmation";
import { ConfirmationActions, ConfirmationLayout } from "@/common/Confirmation/ConfirmationLayout";
import {
	ConfirmationNote,
	ConfirmationSection,
	FactRow,
} from "@/common/Confirmation/ConfirmationParts";

import {
	DAPP_ADD_CHAIN_CONFIRMATION_KIND,
	type DappAddChainConfirmationData,
	isDappAddChainConfirmationData,
} from "./connectConfirmation";

type Props = {
	data: DappAddChainConfirmationData;
	onConfirm: () => void;
	onDecline: () => void;
};

export function DappAddChainConfirmation({ data, onConfirm, onDecline }: Props) {
	return (
		<ConfirmationLayout
			origin={data.origin}
			title={`Add ${data.name}`}
			statement="The dapp asks to add this network to the wallet."
			footer={
				<ConfirmationActions
					confirmLabel="Add network"
					onReject={onDecline}
					onConfirm={onConfirm}
				/>
			}
		>
			<ConfirmationSection title="Network">
				<FactRow label="Name" value={data.name} />
				<FactRow label="Type" value={data.network} />
				<FactRow label="Backend" value={data.backendUrl} mono />
			</ConfirmationSection>
			<ConfirmationNote tone="warning">
				Only add networks you trust. The backend sees every address the wallet looks up.
			</ConfirmationNote>
		</ConfirmationLayout>
	);
}

export const dappAddChainConfirmationRenderer: ConfirmationRenderer = {
	kind: DAPP_ADD_CHAIN_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isDappAddChainConfirmationData(request.data) ? (
			<DappAddChainConfirmation
				data={request.data}
				onConfirm={() => onConfirm()}
				onDecline={onDecline}
			/>
		) : null,
};
