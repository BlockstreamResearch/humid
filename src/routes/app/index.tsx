import { Outlet } from "@tanstack/react-router";

export function AppLayout() {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<Outlet />
		</div>
	);
}
