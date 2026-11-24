import type { ConfirmationRenderer } from "@/common/Confirmation";
import {
	ConfirmationDetails,
	count,
	DetailsGroup,
	DetailsRow,
	shortAddress,
} from "@/common/Confirmation/ConfirmationDetails";
import {
	ConfirmationActions,
	ConfirmationLayout,
	signLabel,
} from "@/common/Confirmation/ConfirmationLayout";
import {
	AmountRow,
	ConfirmationNote,
	ConfirmationSection,
} from "@/common/Confirmation/ConfirmationParts";
import { ShownAsset } from "@/common/Confirmation/ShownAsset";

import type { LiquidSignPsetReview } from "../../../domain/pset/types";
import { issuanceNote } from "../../../presentation/issuanceNote";
import type { KnownAsset } from "../../confirmationFacts";
import { SignatureScope } from "./SignatureScope";

export const SIGN_PSET_CONFIRMATION_KIND = "liquid.signPset";

export type SignPsetConfirmationData = {
	account: string;
	assets: Record<string, KnownAsset>;
	broadcast: boolean;
	kind: typeof SIGN_PSET_CONFIRMATION_KIND;
	network: string;
	policyAssetId: string;
	signInputs: number[];
	transaction: Omit<LiquidSignPsetReview, "pset">;
};

type Output = SignPsetConfirmationData["transaction"]["outputs"][number];

export function SignPsetConfirmation({
	busy = false,
	data,
	origin,
	onConfirm,
	onReject,
}: {
	busy?: boolean;
	data: SignPsetConfirmationData;
	origin?: string;
	onConfirm: () => void;
	onReject: () => void;
}) {
	const { inputs, issuances, outputs, netEffect, fees } = data.transaction;
	const signs = new Set(data.signInputs);
	const assetOf = (id: string) => {
		const known = data.assets[id];

		return new ShownAsset(id, known?.ticker, known?.decimals);
	};
	const amountOf = (amount?: string, asset?: string) =>
		amount === undefined || asset === undefined
			? "Confidential"
			: assetOf(asset).amountWithLabel(BigInt(amount));
	const fee =
		fees
			.map((row) =>
				row.asset === data.policyAssetId
					? `${row.amount} sats`
					: assetOf(row.asset).amountWithLabel(BigInt(row.amount)),
			)
			.join(" + ") || "None";
	const warnings = inputs
		.filter((input) => signs.has(input.index))
		.map((input) => new SignatureScope(input.sighashType, input.index, outputs.length).warning)
		.filter((warning) => warning !== undefined);
	const issuanceNotes = issuances.map((issuance) =>
		issuanceNote(issuance.index + 1, {
			minted: issuance.amount === undefined ? undefined : amountOf(issuance.amount, issuance.asset),
			reissues: issuance.kind === "reissuance",
			tokens:
				issuance.tokenAmount === undefined
					? undefined
					: amountOf(issuance.tokenAmount, issuance.token),
		}),
	);

	return (
		<ConfirmationLayout
			origin={origin}
			network={data.network}
			title="Sign a transaction"
			statement="The dapp built this transaction."
			footer={
				<ConfirmationActions
					signer={`Signing with ${data.account}`}
					confirmLabel={signLabel(data.broadcast, busy)}
					busy={busy}
					onReject={onReject}
					onConfirm={onConfirm}
				/>
			}
		>
			<ConfirmationSection
				title="Balance changes"
				aside={
					netEffect.length === 0 && <span className="text-muted-foreground text-xs">None</span>
				}
			>
				{netEffect.length === 0
					? undefined
					: netEffect.map((effect) => (
							<AmountRow
								key={effect.asset}
								asset={assetOf(effect.asset)}
								units={BigInt(effect.amount)}
							/>
						))}
			</ConfirmationSection>
			<ConfirmationSection
				title="Network fee"
				aside={<span className="font-mono text-sm font-semibold tabular-nums">{fee}</span>}
			>
				<p className="text-muted-foreground mb-2 text-xs">Set by the dapp</p>
			</ConfirmationSection>
			{[...issuanceNotes, ...warnings].map((warning) => (
				<ConfirmationNote key={warning} tone="warning">
					{warning}
				</ConfirmationNote>
			))}
			{!data.broadcast && (
				<ConfirmationNote>
					The wallet signs the transaction and hands the result back to the dapp to send.
				</ConfirmationNote>
			)}
			<ConfirmationDetails
				summary={`${count(inputs.length, "input")} · ${count(outputs.length, "output")}`}
			>
				<DetailsGroup title="Inputs">
					{inputs.map((input) => (
						<DetailsRow
							key={input.index}
							index={input.index + 1}
							label={
								input.owned
									? signs.has(input.index)
										? "This account signs"
										: "This account"
									: "Not this account"
							}
							note={input.owned ? undefined : "Provided by the dapp"}
							noteByDapp
							value={amountOf(input.amount, input.asset)}
						/>
					))}
				</DetailsGroup>
				<DetailsGroup title="Outputs">
					{outputs.map((output) => (
						<DetailsRow
							key={output.index}
							index={output.index + 1}
							label={outputLabel(output)}
							note={
								output.owned || output.address === undefined
									? undefined
									: shortAddress(output.address)
							}
							value={amountOf(output.amount, output.asset)}
						/>
					))}
				</DetailsGroup>
			</ConfirmationDetails>
		</ConfirmationLayout>
	);
}

function outputLabel(output: Output): string {
	if (output.owned) return "This account";
	if (output.script === "") return "Network fee";
	if (output.address !== undefined) return "Not this account";

	return output.script.startsWith("6a") ? "Data" : "Script";
}

export const signPsetConfirmationRenderer: ConfirmationRenderer = {
	kind: SIGN_PSET_CONFIRMATION_KIND,
	render: ({ busy, onConfirm, onDecline, request }) =>
		isSignPsetConfirmationData(request.data) ? (
			<SignPsetConfirmation
				busy={busy}
				data={request.data}
				origin={request.requester?.origin}
				onConfirm={() => onConfirm()}
				onReject={onDecline}
			/>
		) : null,
};

function isSignPsetConfirmationData(data: unknown): data is SignPsetConfirmationData {
	if (typeof data !== "object" || data === null) return false;

	const candidate = data as Partial<SignPsetConfirmationData>;

	return (
		candidate.kind === SIGN_PSET_CONFIRMATION_KIND &&
		typeof candidate.account === "string" &&
		typeof candidate.broadcast === "boolean" &&
		typeof candidate.network === "string" &&
		typeof candidate.policyAssetId === "string" &&
		typeof candidate.assets === "object" &&
		Array.isArray(candidate.signInputs) &&
		Array.isArray(candidate.transaction?.inputs) &&
		Array.isArray(candidate.transaction.outputs) &&
		Array.isArray(candidate.transaction.netEffect) &&
		Array.isArray(candidate.transaction.fees)
	);
}
