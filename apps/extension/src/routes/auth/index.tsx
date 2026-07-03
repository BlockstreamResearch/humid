import { Navigate, Outlet } from "@tanstack/react-router";

export function AuthLayout() {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<Outlet />
		</div>
	);
}

export function AuthIndexForwarder() {
	return <Navigate replace to="/auth/intro" />;
}
