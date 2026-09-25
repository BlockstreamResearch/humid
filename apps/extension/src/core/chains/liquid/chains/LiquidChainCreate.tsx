import { UiField, UiFieldLabel } from "@/ui/UiField";
import {
	UiSelect,
	UiSelectContent,
	UiSelectItem,
	UiSelectTrigger,
	UiSelectValue,
} from "@/ui/UiSelect/base";

import {
	LIQUID_NETWORK_KINDS,
	type LiquidChainRecord,
	type LiquidNetworkKind,
} from "./LiquidChainRecord";
import { LiquidChainSettings } from "./LiquidChainSettings";

const NETWORK_LABELS: Record<LiquidNetworkKind, string> = {
	[LIQUID_NETWORK_KINDS.MAINNET]: "Liquid",
	[LIQUID_NETWORK_KINDS.TESTNET]: "Liquid Testnet",
	[LIQUID_NETWORK_KINDS.REGTEST]: "Regtest (custom)",
};

const NETWORK_KINDS: LiquidNetworkKind[] = [
	LIQUID_NETWORK_KINDS.MAINNET,
	LIQUID_NETWORK_KINDS.TESTNET,
	LIQUID_NETWORK_KINDS.REGTEST,
];

export type LiquidChainCreateProps = {
	chain: LiquidChainRecord;
	onChange: (chain: LiquidChainRecord) => void;
};

export function LiquidChainCreate({ chain, onChange }: LiquidChainCreateProps) {
	const setNetwork = (network: LiquidNetworkKind) => {
		onChange({
			...chain,
			settings: {
				...chain.settings,
				network,
				policyAsset:
					network === LIQUID_NETWORK_KINDS.REGTEST ? chain.settings.policyAsset : undefined,
			},
		});
	};

	return (
		<>
			<UiField>
				<UiFieldLabel htmlFor="liquid-network">Network kind</UiFieldLabel>
				<UiSelect
					items={NETWORK_LABELS}
					value={chain.settings.network}
					onValueChange={(value) => setNetwork(value as LiquidNetworkKind)}
				>
					<UiSelectTrigger id="liquid-network" className="w-full">
						<UiSelectValue />
					</UiSelectTrigger>
					<UiSelectContent>
						{NETWORK_KINDS.map((kind) => (
							<UiSelectItem key={kind} value={kind}>
								{NETWORK_LABELS[kind]}
							</UiSelectItem>
						))}
					</UiSelectContent>
				</UiSelect>
			</UiField>
			<LiquidChainSettings chain={chain} onChange={onChange} />
		</>
	);
}
