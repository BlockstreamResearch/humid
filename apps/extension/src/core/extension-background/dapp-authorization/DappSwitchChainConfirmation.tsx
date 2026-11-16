import type { ConfirmationRenderer } from "@/common/Confirmation";
import { ConfirmationActions, ConfirmationLayout } from "@/common/Confirmation/ConfirmationLayout";
import { ConfirmationSection, FactRow } from "@/common/Confirmation/ConfirmationParts";

import {
	DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
	type DappSwitchChainConfirmationData,
	isDappSwitchChainConfirmationData,
} from "./connectConfirmation";

type Props = {
	data: DappSwitchChainConfirmationData;
	onConfirm: () => void;
	onDecline: () => void;
};

export function DappSwitchChainConfirmation({ data, onConfirm, onDecline }: Props) {
	return (
		<ConfirmationLayout
			origin={data.origin}
			title={`Use ${data.chainName}`}
			statement="The dapp asks to use this network with the connected accounts."
			footer={
				<ConfirmationActions
					confirmLabel="Use network"
					onReject={onDecline}
					onConfirm={onConfirm}
				/>
			}
		>
			<ConfirmationSection title="Network">
				<FactRow label="Name" value={data.chainName} />
				<FactRow label="Chain ID" value={data.chainId} mono />
			</ConfirmationSection>
		</ConfirmationLayout>
	);
}

export const dappSwitchChainConfirmationRenderer: ConfirmationRenderer = {
	kind: DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isDappSwitchChainConfirmationData(request.data) ? (
			<DappSwitchChainConfirmation
				data={request.data}
				onConfirm={() => onConfirm()}
				onDecline={onDecline}
			/>
		) : null,
};
