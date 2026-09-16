import { useNavigate } from "@tanstack/react-router";

import {
	errorMessage,
	useAccountActions,
} from "@/routes/App/pages/Settings/hooks/useAccountActions";

import { AddAccountView } from "./components/AddAccountView";

export function SettingsAddAccountPage() {
	const navigate = useNavigate();
	const { createAccount, importAccount } = useAccountActions();

	const goToSettings = () => {
		void navigate({ to: "/app/settings" });
	};

	return (
		<AddAccountView
			accountTypeLabel="Liquid"
			error={errorMessage(createAccount.error ?? importAccount.error)}
			isSubmitting={createAccount.isPending || importAccount.isPending}
			onCreate={(input) => createAccount.mutate(input, { onSuccess: goToSettings })}
			onImport={(input) => importAccount.mutate(input, { onSuccess: goToSettings })}
		/>
	);
}
