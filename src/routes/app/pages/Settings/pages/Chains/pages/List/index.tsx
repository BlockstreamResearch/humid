import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { useChains } from "@/routes/App/pages/Home/HomeContext/hooks/useChains";
import { UiSpinner } from "@/ui/UiSpinner";

import { chainGroupUis } from "../../chainGroups";
import { ChainListView } from "./components/ChainListView";

/** Chain list (container): the chains grouped by chain group, each drilling into settings. */
export function ChainListPage() {
	const { chains, isLoading } = useChains();

	if (isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	return <ChainListView groups={groupChains(chains)} />;
}

function groupChains(chains: ChainRecord[]) {
	const byGroup = new Map<string, ChainRecord[]>();

	for (const chain of chains) {
		const list = byGroup.get(chain.chainGroupId) ?? [];
		list.push(chain);
		byGroup.set(chain.chainGroupId, list);
	}

	return [...byGroup.entries()].map(([id, chainList]) => ({
		chains: chainList,
		id,
		name: chainGroupUis[id]?.name ?? id,
	}));
}
