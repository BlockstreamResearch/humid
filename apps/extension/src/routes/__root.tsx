import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";

import { UiToaster } from "@/ui/UiToaster";

export const rootRoute = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	return (
		<Suspense fallback={null}>
			<Outlet />

			<UiToaster />
		</Suspense>
	);
}
