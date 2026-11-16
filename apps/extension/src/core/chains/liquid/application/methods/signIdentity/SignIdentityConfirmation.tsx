import { UserCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import { ConfirmationDetails } from "@/common/Confirmation/ConfirmationDetails";
import { ConfirmationActions, ConfirmationLayout } from "@/common/Confirmation/ConfirmationLayout";
import { ConfirmationSection, FactRow, TextBlock } from "@/common/Confirmation/ConfirmationParts";

export const SIGN_IDENTITY_CONFIRMATION_KIND = "liquid.signIdentity";

export type SignIdentityConfirmationData = {
	challenge: string;
	fingerprint: string;
	identity: string;
	index: number;
	kind: typeof SIGN_IDENTITY_CONFIRMATION_KIND;
	network: string;
	text?: string;
};

export function SignIdentityConfirmation({
	data,
	origin,
	onConfirm,
	onReject,
}: {
	data: SignIdentityConfirmationData;
	origin?: string;
	onConfirm: () => void;
	onReject: () => void;
}) {
	return (
		<ConfirmationLayout
			origin={origin}
			network={data.network}
			title="Prove an identity"
			statement="The dapp asks for a challenge signed with the identity key. Signing moves no funds."
			footer={<ConfirmationActions confirmLabel="Sign" onReject={onReject} onConfirm={onConfirm} />}
		>
			<ConfirmationSection title="Identity">
				<div className="flex items-center gap-2.5 py-2.5">
					<HugeiconsIcon icon={UserCircleIcon} className="text-muted-foreground size-5 shrink-0" />
					<span className="flex min-w-0 flex-col gap-0.5">
						<span className="text-sm font-semibold break-all">{data.identity}</span>
						<span className="text-muted-foreground text-xs">
							Key {data.index} for this identity
						</span>
					</span>
				</div>
			</ConfirmationSection>
			<TextBlock title="Challenge" byDapp>
				{data.text ?? (
					<span className="flex flex-col gap-1">
						<span className="text-muted-foreground text-xs">
							Not a readable text. The challenge fingerprint:
						</span>
						<span className="font-mono font-semibold tracking-wide">
							{data.fingerprint.match(/.{1,4}/g)?.join(" ")}
						</span>
					</span>
				)}
			</TextBlock>
			<ConfirmationDetails summary="Full challenge">
				<div>
					<FactRow label="Challenge, as hex" value={data.challenge} mono />
					<FactRow label="Key type" value="NIST P-256" />
				</div>
			</ConfirmationDetails>
		</ConfirmationLayout>
	);
}

export const signIdentityConfirmationRenderer: ConfirmationRenderer = {
	kind: SIGN_IDENTITY_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isSignIdentityConfirmationData(request.data) ? (
			<SignIdentityConfirmation
				data={request.data}
				origin={request.requester?.origin}
				onConfirm={() => onConfirm()}
				onReject={onDecline}
			/>
		) : null,
};

function isSignIdentityConfirmationData(data: unknown): data is SignIdentityConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === SIGN_IDENTITY_CONFIRMATION_KIND
	);
}
