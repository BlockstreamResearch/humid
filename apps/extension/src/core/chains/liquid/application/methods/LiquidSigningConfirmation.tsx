import { hexToBytes } from "@noble/hashes/utils.js";
import type { ReactNode } from "react";
import { z } from "zod";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import { ConfirmationRequestDetails } from "@/common/Confirmation/ConfirmationRequestDetails";
import type { ConfirmationRequest } from "@/helpers/background";
import { UiButton } from "@/ui/UiButton/base";

const accountFields = {
	accountIdentifier: z.string(),
	chainId: z.string(),
};
const assetAmount = z.object({ asset: z.string(), amount: z.string() });
const signingData = z.discriminatedUnion("kind", [
	z.object({
		...accountFields,
		address: z.string(),
		kind: z.literal("liquid.signMessage"),
		message: z.string(),
		protocol: z.string(),
	}),
	z.object({
		chainId: z.string(),
		challenge: z.string().regex(/^(?:[0-9a-fA-F]{2})+$/),
		challengeFingerprint: z.string(),
		curve: z.string(),
		identity: z.string(),
		index: z.number().int().nonnegative(),
		kind: z.literal("liquid.signIdentity"),
	}),
	z.object({
		...accountFields,
		broadcast: z.boolean(),
		kind: z.literal("liquid.signPset"),
		requestedInputs: z.array(
			z.object({
				address: z.string(),
				index: z.number().int().nonnegative(),
				sighashTypes: z.array(z.number().int()),
			}),
		),
		transaction: z.object({
			pset: z.string().min(1),
			inputs: z.array(
				z.object({
					index: z.number().int().nonnegative(),
					sighashType: z.number().int().nonnegative(),
				}),
			),
			fees: z.array(assetAmount),
			netEffect: z.array(assetAmount),
			outputs: z.array(
				z.object({
					address: z.string().optional(),
					amount: z.string().optional(),
					asset: z.string().optional(),
					index: z.number().int().nonnegative(),
					script: z.string(),
				}),
			),
		}),
	}),
	z.object({
		...accountFields,
		amount: z.string(),
		assetId: z.string(),
		kind: z.literal("liquid.sendTransfer"),
		memo: z.string().optional(),
		recipientAddress: z.string(),
		recipientConfidential: z.boolean(),
	}),
]);

type SigningData = z.infer<typeof signingData>;

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="space-y-1">
			<dt className="text-muted-foreground text-xs font-semibold">{label}</dt>
			<dd className="text-sm break-all whitespace-pre-wrap">{children}</dd>
		</div>
	);
}

function RequestContents({ data }: { data: SigningData }) {
	switch (data.kind) {
		case "liquid.signMessage":
			return (
				<>
					<Detail label="Signing address">{data.address}</Detail>
					<Detail label="Signature protocol">{data.protocol}</Detail>
					<Detail label="Message to sign">
						<pre className="font-mono text-sm break-all whitespace-pre-wrap">{data.message}</pre>
					</Detail>
				</>
			);
		case "liquid.signIdentity": {
			let challengeText: string | undefined;
			try {
				const text = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(data.challenge));
				let readable = true;
				for (const character of text) {
					const code = character.charCodeAt(0);
					if (
						code <= 8 ||
						code === 11 ||
						code === 12 ||
						(code >= 14 && code <= 31) ||
						code === 127
					) {
						readable = false;
						break;
					}
				}
				if (readable) challengeText = text;
			} catch {
				// Binary challenges are shown as their exact hexadecimal bytes below.
			}
			return (
				<>
					<Detail label="Identity">{data.identity}</Detail>
					<Detail label="Identity index">{data.index}</Detail>
					<Detail label="Curve">{data.curve}</Detail>
					{challengeText !== undefined && (
						<Detail label="Challenge (UTF-8)">{challengeText}</Detail>
					)}
					<Detail label="Challenge (hex)">
						<span className="font-mono">{data.challenge}</span>
					</Detail>
					<Detail label="Challenge fingerprint (SHA-256 prefix)">
						{data.challengeFingerprint}
					</Detail>
				</>
			);
		}
		case "liquid.signPset":
			return (
				<>
					<Detail label="After signing">
						{data.broadcast
							? "Broadcast this transaction"
							: "Return the signed PSET to the app; do not broadcast"}
					</Detail>
					<Detail label="Requested signing inputs">
						{data.requestedInputs.map((input) => (
							<div className="mb-2" key={input.index}>
								Input {input.index}: {input.address}
								<br />
								Requested sighash allowances:{" "}
								{input.sighashTypes.map((type) => `0x${type.toString(16)}`).join(", ")}
							</div>
						))}
					</Detail>
					<Detail label="Effective PSET input sighashes">
						{data.transaction.inputs.map((input) => {
							const requested = data.requestedInputs.find((item) => item.index === input.index);
							const baseType = input.sighashType & 0x1f;
							return (
								<div className="mb-2" key={input.index}>
									Input {input.index}: 0x{input.sighashType.toString(16)} ({input.sighashType})
									<div>
										{baseType === 1
											? "ALL: commits to all outputs."
											: baseType === 2
												? "NONE: does not commit to outputs."
												: baseType === 3
													? "SINGLE: commits to the output at this input index."
													: "Nonstandard sighash base type."}{" "}
										{(input.sighashType & 0x80) !== 0
											? "ANYONECANPAY: commits only to this input."
											: "Commits to all inputs."}
									</div>
									{requested && !requested.sighashTypes.includes(input.sighashType) && (
										<p role="alert" className="text-amber-600">
											The effective sighash differs from the app's requested allowances. Signing
											uses the effective PSET sighash shown here, not those allowances.
										</p>
									)}
								</div>
							);
						})}
					</Detail>
					<Detail label="Wallet net change (base units)">
						{data.transaction.netEffect.length === 0 && "No wallet balance change"}
						{data.transaction.netEffect.map((effect) => (
							<div key={effect.asset}>
								{effect.amount} · {effect.asset}
							</div>
						))}
					</Detail>
					<Detail label="Transaction fees (base units)">
						{data.transaction.fees.length === 0 && "No fee outputs"}
						{data.transaction.fees.map((fee) => (
							<div key={fee.asset}>
								{fee.amount} · {fee.asset}
							</div>
						))}
					</Detail>
					{data.transaction.outputs.map((output) => (
						<Detail
							label={`Output ${output.index}${output.script === "" ? " (fee)" : ""}`}
							key={output.index}
						>
							{output.address && <div>{output.address}</div>}
							<div>
								{output.amount ?? "Confidential amount unavailable"} ·{" "}
								{output.asset ?? "Confidential asset unavailable"}
							</div>
							{output.script && <div className="font-mono text-xs">Script: {output.script}</div>}
						</Detail>
					))}
					<details className="text-sm">
						<summary>Prepared PSET to sign (base64)</summary>
						<pre className="mt-2 font-mono text-xs break-all whitespace-pre-wrap">
							{data.transaction.pset}
						</pre>
					</details>
				</>
			);
		case "liquid.sendTransfer":
			return (
				<>
					<Detail label="Recipient">{data.recipientAddress}</Detail>
					<Detail label="Amount (base units)">{data.amount}</Detail>
					<Detail label="Asset">{data.assetId}</Detail>
					{data.memo && <Detail label="Memo">{data.memo}</Detail>}
					{!data.recipientConfidential && (
						<p className="text-sm">
							This recipient is unconfidential; the amount and asset will be publicly visible.
						</p>
					)}
					<p className="text-sm">This transfer will be signed and broadcast.</p>
				</>
			);
	}
}

export function LiquidSigningConfirmation({
	request,
	onConfirm,
	onDecline,
}: {
	request: ConfirmationRequest;
	onConfirm: () => void;
	onDecline: () => void;
}) {
	const parsed = signingData.safeParse(request.data);
	const data = parsed.success ? parsed.data : null;
	const signAndSend =
		data?.kind === "liquid.sendTransfer" || (data?.kind === "liquid.signPset" && data.broadcast);

	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">{request.title}</h2>
				{request.message && <p className="text-muted-foreground mt-1 text-sm">{request.message}</p>}
			</header>
			<div className="flex-1 space-y-5 overflow-y-auto px-4">
				<ConfirmationRequestDetails request={request} />
				{data ? (
					<dl className="space-y-4">
						<Detail label="Network">{data.chainId}</Detail>
						{"accountIdentifier" in data && (
							<Detail label="Account">{data.accountIdentifier}</Detail>
						)}
						<RequestContents data={data} />
					</dl>
				) : (
					<p>
						The signing request could not be read. Nothing has been signed or sent. Decline and ask
						the app to try again.
					</p>
				)}
			</div>
			<div className="flex items-center gap-3 p-4 pt-3">
				<UiButton type="button" variant="outline" className="flex-1" onClick={onDecline}>
					Decline
				</UiButton>
				{data && (
					<UiButton type="button" className="flex-1" onClick={onConfirm}>
						{signAndSend ? "Sign and send" : "Sign"}
					</UiButton>
				)}
			</div>
		</div>
	);
}

export const liquidSigningConfirmationRenderers: ConfirmationRenderer[] = [
	"liquid.signMessage",
	"liquid.signIdentity",
	"liquid.signPset",
	"liquid.sendTransfer",
].map((kind) => ({
	kind,
	render: ({ request, onConfirm, onDecline }) => (
		<LiquidSigningConfirmation
			request={request}
			onConfirm={() => onConfirm()}
			onDecline={onDecline}
		/>
	),
}));
