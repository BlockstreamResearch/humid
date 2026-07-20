import { Outlet } from "@tanstack/react-router";

/** Connected dapps area layout: renders the active page (the account's dapp list or a per-dapp policy page). */
export function ConnectedDappsLayout() {
	return <Outlet />;
}
