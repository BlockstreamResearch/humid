import type { ConfirmationRequest } from "@/helpers/background";

export function ConfirmationRequestDetails({ request }: { request: ConfirmationRequest }) {
	return (
		<dl className="space-y-2 text-sm">
			<div>
				<dt className="text-muted-foreground">Requesting app / origin</dt>
				{request.requester?.name && <dd className="break-all">{request.requester.name}</dd>}
				<dd className="font-mono text-xs break-all">
					{request.requester?.origin ?? "Requester information unavailable"}
				</dd>
			</div>
			{request.method && (
				<div>
					<dt className="text-muted-foreground">Method</dt>
					<dd className="font-mono text-xs break-all">{request.method}</dd>
				</div>
			)}
		</dl>
	);
}
