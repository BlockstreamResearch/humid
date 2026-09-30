import type { LiquidProcessConfidentialTransactionParams } from "@humid/appkit-injected-adapter";
import { parseLiquidProcessCtParams, type ParsedLiquidProcessCtParams } from "@humid/tx-manifest";
import { useMemo, useState } from "react";

import { ResultPanel } from "@/app/dashboard/components/ResultPanel";
import { useRpcCall } from "@/app/dashboard/lib/useRpcCall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

type ReadRequest =
	| { kind: "empty" }
	| { kind: "invalid"; problems: string[] }
	| {
			kind: "ready";
			raw: LiquidProcessConfidentialTransactionParams;
			request: ParsedLiquidProcessCtParams;
	  };

export default function ManifestRunner() {
	const [text, setText] = useState("");
	const [fileName, setFileName] = useState<string | null>(null);
	const [revision, setRevision] = useState(0);

	const read = useMemo(() => readRequest(text), [text]);
	const name = fileName ?? "Pasted request";

	const replace = (nextText: string, nextFileName: string | null) => {
		setText(nextText);
		setFileName(nextFileName);
		setRevision((count) => count + 1);
	};

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<Card>
				<CardHeader>
					<CardTitle>Process a confidential transaction</CardTitle>
					<CardDescription>
						Select a JSON file or paste JSON holding a processConfidentialTransaction request —
						action, manifest, contractSources, and optionally params, state, instance and broadcast.
						It is sent to the HUMID extension as-is, and the wallet asks for confirmation before
						anything is signed.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="process-ct-request">Request file</Label>
						<input
							id="process-ct-request"
							type="file"
							accept=".json,application/json"
							className="file:border-input file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1 file:text-sm"
							onChange={async (event) => {
								const input = event.target;
								const file = input.files?.[0];
								// Clear so choosing the same file again, after editing it, fires onChange.
								input.value = "";

								if (file === undefined) {
									return;
								}

								replace(await file.text(), file.name);
							}}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="process-ct-request-text">Or paste the request JSON</Label>
						<Textarea
							id="process-ct-request-text"
							value={text}
							onChange={(event) => replace(event.target.value, null)}
							placeholder="{ }"
							spellCheck={false}
							className="min-h-48 font-mono text-xs"
						/>
					</div>

					<div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => replace("", null)}
							disabled={text === ""}
						>
							Clear
						</Button>
					</div>
				</CardContent>
			</Card>

			{read.kind === "invalid" && (
				<Card>
					<CardHeader>
						<CardTitle>Not a processConfidentialTransaction request</CardTitle>
						<CardDescription>{name}</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
							{read.problems.map((problem) => (
								<li key={problem}>{problem}</li>
							))}
						</ul>
					</CardContent>
				</Card>
			)}

			{read.kind === "ready" && (
				// Keyed per change so an edited or new request never shows the previous result.
				<RequestCard key={revision} name={name} raw={read.raw} request={read.request} />
			)}
		</div>
	);
}

function RequestCard({
	name,
	raw,
	request,
}: {
	name: string;
	raw: LiquidProcessConfidentialTransactionParams;
	request: ParsedLiquidProcessCtParams;
}) {
	const { connect, hasProvider, isConnected, wallet } = useHumidContext();
	const { call, pending, result } = useRpcCall();

	const sources = Object.keys(request.contractSources);
	const parts = (["params", "state", "instance"] as const).filter(
		(part) => part in raw && raw[part] !== undefined,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{name}</CardTitle>
				<CardDescription>Checked against the same schema the wallet parses with.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
					<dt className="text-muted-foreground">Action</dt>
					<dd className="font-mono">{request.action}</dd>

					<dt className="text-muted-foreground">Broadcast</dt>
					<dd>
						{request.broadcast
							? "yes — the wallet sends it to the network"
							: "no — the signed transaction comes back unsent"}
					</dd>

					<dt className="text-muted-foreground">Contract sources</dt>
					<dd className="flex flex-wrap gap-1">
						{sources.length === 0
							? "none"
							: sources.map((path) => (
									<Badge key={path} variant="outline" className="font-mono">
										{path}
									</Badge>
								))}
					</dd>

					<dt className="text-muted-foreground">Also supplied</dt>
					<dd>{parts.length === 0 ? "nothing else" : parts.join(", ")}</dd>
				</dl>

				{!hasProvider ? (
					<p className="text-sm text-amber-600 dark:text-amber-500">
						window.humid is not present on this page. Load the HUMID extension, then reload this
						tab.
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => call(() => wallet.processConfidentialTransaction(raw))}
							disabled={pending}
						>
							{pending ? "Waiting for the wallet…" : "Send to wallet"}
						</Button>
						{isConnected ? null : (
							<Button variant="outline" onClick={() => call(connect)} disabled={pending}>
								Connect wallet
							</Button>
						)}
					</div>
				)}

				<ResultPanel result={result} />
			</CardContent>
		</Card>
	);
}

function readRequest(text: string): ReadRequest {
	if (text.trim() === "") {
		return { kind: "empty" };
	}

	let value: unknown;

	try {
		value = JSON.parse(text);
	} catch (error) {
		return {
			kind: "invalid",
			problems: [error instanceof Error ? error.message : "This is not JSON."],
		};
	}

	const parsed = parseLiquidProcessCtParams(value);

	if (!parsed.ok) {
		const { fieldErrors, formErrors } = parsed.malformed.details;

		return {
			kind: "invalid",
			problems: [
				...formErrors,
				...Object.entries(fieldErrors).flatMap(([field, messages]) =>
					(messages ?? []).map((message) => `${field}: ${message}`),
				),
			],
		};
	}

	return {
		kind: "ready",
		raw: value as LiquidProcessConfidentialTransactionParams,
		request: parsed.request,
	};
}
