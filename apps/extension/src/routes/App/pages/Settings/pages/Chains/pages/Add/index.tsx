import { Navigate, useNavigate } from "@tanstack/react-router";

import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { useChainActions } from "@/routes/App/pages/Settings/hooks/useChainActions";

import { ChainAddForm } from "../../components/ChainAddForm";
import { Route } from "./route";

export function ChainAddPage() {
	const { group: groupId } = Route.useSearch();
	const navigate = useNavigate();
	const { addChain } = useChainActions();

	const groupUi = groupId ? chainGroupUis[groupId] : undefined;

	if (!groupUi) return <Navigate replace to="/app/settings/chains" />;

	return (
		<ChainAddForm
			error={addChain.error instanceof Error ? addChain.error.message : null}
			groupUi={groupUi}
			isSubmitting={addChain.isPending}
			onSubmit={(chain) =>
				addChain.mutate({ chain }, { onSuccess: () => navigate({ to: "/app/settings/chains" }) })
			}
		/>
	);
}
