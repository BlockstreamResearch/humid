import { UiInput } from "@/ui/UiInput/base";
import { UiTabs, UiTabsContent, UiTabsList, UiTabsTrigger } from "@/ui/UiTabs/base";

import {
	LIQUID_CHAIN_BACKENDS,
	type LiquidChainBackend,
	type LiquidChainRecord,
} from "./LiquidChainRecord";

export type LiquidChainSettingsProps = {
	chain: LiquidChainRecord;
	onChange: (chain: LiquidChainRecord) => void;
};

export function LiquidChainSettings({ chain, onChange }: LiquidChainSettingsProps) {
	const backend = chain.settings.backend;

	const setBackend = (nextBackend: LiquidChainBackend) => {
		onChange({
			...chain,
			settings: {
				...chain.settings,
				backend: nextBackend,
			},
		});
	};

	return (
		<UiTabs
			value={backend.kind}
			onValueChange={(value) => {
				if (value === LIQUID_CHAIN_BACKENDS.WATERFALLS) {
					setBackend({
						kind: LIQUID_CHAIN_BACKENDS.WATERFALLS,
						url:
							backend.kind === LIQUID_CHAIN_BACKENDS.WATERFALLS
								? backend.url
								: "https://waterfalls.liquidwebwallet.org/liquid/api",
					});
					return;
				}

				setBackend({
					kind: LIQUID_CHAIN_BACKENDS.ESPLORA,
					url: backend.url,
				});
			}}
		>
			<UiTabsList variant="line">
				<UiTabsTrigger value={LIQUID_CHAIN_BACKENDS.ESPLORA}>Esplora</UiTabsTrigger>
				<UiTabsTrigger value={LIQUID_CHAIN_BACKENDS.WATERFALLS}>Waterfalls</UiTabsTrigger>
			</UiTabsList>
			<UiTabsContent value={LIQUID_CHAIN_BACKENDS.ESPLORA}>
				<UiInput
					value={backend.url}
					onChange={(event) =>
						setBackend({
							kind: LIQUID_CHAIN_BACKENDS.ESPLORA,
							url: event.target.value,
						})
					}
				/>
			</UiTabsContent>
			<UiTabsContent value={LIQUID_CHAIN_BACKENDS.WATERFALLS}>
				<UiInput
					value={backend.url}
					onChange={(event) =>
						setBackend({
							kind: LIQUID_CHAIN_BACKENDS.WATERFALLS,
							url: event.target.value,
							utxoOnly:
								backend.kind === LIQUID_CHAIN_BACKENDS.WATERFALLS ? backend.utxoOnly : undefined,
						})
					}
				/>
			</UiTabsContent>
		</UiTabs>
	);
}
