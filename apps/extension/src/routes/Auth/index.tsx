import { Navigate, Outlet } from "@tanstack/react-router";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

export function AuthLayout() {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<UiPageBackgroundWrp>
				<Outlet />
			</UiPageBackgroundWrp>
		</div>
	);
}

export function AuthIndexForwarder() {
	return <Navigate replace to="/auth/intro" />;
}
