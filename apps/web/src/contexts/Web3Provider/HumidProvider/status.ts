export type DataStatus = "idle" | "loading" | "ready" | "needs-approval" | "error";

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
