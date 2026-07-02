import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { useChainActions } from "@/routes/App/pages/Settings/hooks/useChainActions";

import { chainGroupUis } from "../../chainGroups";
import { ChainAddView } from "./components/ChainAddView";

// Only one chain group is registered today, so it's auto-selected (see TODO in the view).
const defaultChainGroupUi = Object.values(chainGroupUis)[0];

if (!defaultChainGroupUi) {
	throw new Error("No chain group UI is registered.");
}

/** Add chain (container): builds a fresh custom-chain draft and persists it via addChain. */
export function ChainAddPage() {
	const navigate = useNavigate();
	const { addChain } = useChainActions();
	const [draft, setDraft] = useState<ChainRecord>(() => defaultChainGroupUi.createDraft(""));

	const Settings = defaultChainGroupUi.Settings;

	const handleSubmit = () => {
		addChain.mutate(
			{ chain: draft },
			{ onSuccess: () => navigate({ to: "/app/settings/chains" }) },
		);
	};

	return (
		<ChainAddView
			chainTypeLabel={defaultChainGroupUi.name}
			error={addChain.error instanceof Error ? addChain.error.message : null}
			isSubmitting={addChain.isPending}
			name={draft.name}
			onNameChange={(name) => setDraft({ ...draft, name })}
			onSubmit={handleSubmit}
		>
			<Settings chain={draft} onChange={setDraft} />
		</ChainAddView>
	);
}
