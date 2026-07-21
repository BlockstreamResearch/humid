/** The lifecycle a policy-gated read (balance, identity) exposes to the UI. */
export type DataStatus = "idle" | "loading" | "ready" | "needs-approval" | "error";

/**
 * Fold a react-query result and the connect/policy state into one status. `needs-approval` means the
 * value would prompt the wallet, so it is not auto-loaded — the UI offers a manual refresh instead.
 * Once data exists (via that manual fetch or a silent auto-load) the status is `ready`.
 */
export function deriveDataStatus(
	query: { data: unknown; isError: boolean; isFetching: boolean },
	{ connected, silent }: { connected: boolean; silent: boolean },
): DataStatus {
	if (!connected) return "idle";
	if (query.isError) return "error";
	if (query.data !== undefined) return "ready";
	if (query.isFetching) return "loading";
	return silent ? "loading" : "needs-approval";
}
