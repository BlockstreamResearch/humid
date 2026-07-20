import type { CallResult } from "../lib/useRpcCall";

export function ResultPanel({ result }: { result: CallResult | null }) {
	if (!result) return null;

	return (
		<div
			className={
				result.ok
					? "bg-muted rounded-md p-3"
					: "rounded-md border border-red-500/30 bg-red-500/10 p-3"
			}
		>
			<p
				className={
					result.ok
						? "text-muted-foreground mb-1 text-xs font-medium"
						: "mb-1 text-xs font-medium text-red-600"
				}
			>
				{result.ok ? "Result" : "Error"}
			</p>
			<code className="text-xs break-all whitespace-pre-wrap">{result.text}</code>
		</div>
	);
}
