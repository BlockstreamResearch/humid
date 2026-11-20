import { useHome } from "../../HomeContext";
import { ActivityView } from "./components/ActivityView";
import { useAccountActivity } from "./useAccountActivity";

export function ActivityPage() {
	const { accountGroup, chain, portfolio } = useHome();
	const activity = useAccountActivity({
		accountGroupId: accountGroup.id,
		chainId: chain.id,
		isSyncing: portfolio.isSyncing,
	});

	return <ActivityView activity={activity} chain={chain} tokens={portfolio.tokens} />;
}
