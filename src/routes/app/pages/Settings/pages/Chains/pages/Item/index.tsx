import { Navigate } from "@tanstack/react-router";
import { useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { useChains } from "@/routes/App/pages/Home/HomeContext/hooks/useChains";
import { useChainActions } from "@/routes/App/pages/Settings/hooks/useChainActions";
import { UiSpinner } from "@/ui/UiSpinner";

import { chainGroupUis } from "../../chainGroups";
import { ChainItemView } from "./components/ChainItemView";
import { Route } from "./route";

/**
 * Per-chain settings (container): resolves the chain from the route param, renders the
 * chain group's own settings component against a draft, and persists it on save.
 */
export function ChainItemPage() {
	const { chainId } = Route.useParams();
	const { chains, isLoading } = useChains();
	const { updateChain } = useChainActions();

	if (isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	const chain = chains.find((candidate) => candidate.id === chainId);

	if (!chain) return <Navigate replace to="/app/settings/chains" />;

	return (
		<ChainSettingsEditor
			key={chain.id}
			chain={chain}
			isSaving={updateChain.isPending}
			onSave={(next) => updateChain.mutate({ chain: next })}
		/>
	);
}

function ChainSettingsEditor({
	chain,
	isSaving,
	onSave,
}: {
	chain: ChainRecord;
	isSaving: boolean;
	onSave: (chain: ChainRecord) => void;
}) {
	const [draft, setDraft] = useState(chain);
	const Settings = chainGroupUis[chain.chainGroupId]?.Settings;

	return (
		<ChainItemView chainName={chain.name} isSaving={isSaving} onSave={() => onSave(draft)}>
			{Settings ? (
				<Settings chain={draft} onChange={setDraft} />
			) : (
				<p className="text-muted-foreground text-sm">No settings available for this chain.</p>
			)}
		</ChainItemView>
	);
}
