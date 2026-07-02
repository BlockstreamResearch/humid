import { Navigate, useNavigate } from "@tanstack/react-router";
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
 * chain group's own settings component against a draft, persists it on save, and (for
 * custom chains) removes it.
 */
export function ChainItemPage() {
	const { chainId } = Route.useParams();
	const { chains, isLoading } = useChains();
	const { updateChain, removeChain } = useChainActions();
	const navigate = useNavigate();

	if (isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	const chain = chains.find((candidate) => candidate.id === chainId);

	if (!chain) return <Navigate replace to="/app/settings/chains" />;

	const groupUi = chainGroupUis[chain.chainGroupId];
	const removable = groupUi ? !groupUi.isBuiltIn(chain.id) : false;

	const handleRemove = () => {
		removeChain.mutate(
			{ chainId: chain.id },
			{ onSuccess: () => navigate({ to: "/app/settings/chains" }) },
		);
	};

	return (
		<ChainSettingsEditor
			key={chain.id}
			chain={chain}
			isRemoving={removeChain.isPending}
			isSaving={updateChain.isPending}
			onRemove={removable ? handleRemove : undefined}
			onSave={(next) => updateChain.mutate({ chain: next })}
		/>
	);
}

function ChainSettingsEditor({
	chain,
	isRemoving,
	isSaving,
	onRemove,
	onSave,
}: {
	chain: ChainRecord;
	isRemoving: boolean;
	isSaving: boolean;
	onRemove?: () => void;
	onSave: (chain: ChainRecord) => void;
}) {
	const [draft, setDraft] = useState(chain);
	const Settings = chainGroupUis[chain.chainGroupId]?.Settings;

	return (
		<ChainItemView
			chainName={chain.name}
			isRemoving={isRemoving}
			isSaving={isSaving}
			onRemove={onRemove}
			onSave={() => onSave(draft)}
		>
			{Settings ? (
				<Settings chain={draft} onChange={setDraft} />
			) : (
				<p className="text-muted-foreground text-sm">No settings available for this chain.</p>
			)}
		</ChainItemView>
	);
}
