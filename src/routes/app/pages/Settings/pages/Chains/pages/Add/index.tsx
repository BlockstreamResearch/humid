import { Navigate, useNavigate } from "@tanstack/react-router";

import { useChainActions } from "@/routes/App/pages/Settings/hooks/useChainActions";

import { chainGroupUis } from "../../chainGroups";
import { ChainAddForm } from "../../components/ChainAddForm";
import { Route } from "./route";

/** Add chain (container): resolves the target chain group from the URL and persists the draft. */
export function ChainAddPage() {
	const { group: groupId } = Route.useSearch();
	const navigate = useNavigate();
	const { addChain } = useChainActions();

	const groupUi = groupId ? chainGroupUis[groupId] : undefined;

	// An add link always carries a known chain group; bail to the list otherwise.
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
