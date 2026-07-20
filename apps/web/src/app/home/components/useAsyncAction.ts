import { useState } from "react";

export type AsyncStatus = "idle" | "pending" | "success" | "error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Track a single wallet action's lifecycle for an overlay: pending / success / error plus the last
 * result. `run` returns a discriminated result so the caller can fire a toast without re-reading state.
 */
export function useAsyncAction<T>() {
	const [status, setStatus] = useState<AsyncStatus>("idle");
	const [data, setData] = useState<T | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);

	const run = async (job: () => Promise<T>): Promise<ActionResult<T>> => {
		setStatus("pending");
		setError(undefined);
		try {
			const value = await job();
			setData(value);
			setStatus("success");
			return { ok: true, data: value };
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			setError(message);
			setStatus("error");
			return { ok: false, error: message };
		}
	};

	const reset = () => {
		setStatus("idle");
		setData(undefined);
		setError(undefined);
	};

	return { status, data, error, run, reset };
}
