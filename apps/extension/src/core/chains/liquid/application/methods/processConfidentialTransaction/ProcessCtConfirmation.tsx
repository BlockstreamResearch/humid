import type { ShownConfirmation, ShownFlowRow } from "@humid/tx-manifest";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import {
	ConfirmationDetails,
	DetailsGroup,
	DetailsRow,
} from "@/common/Confirmation/ConfirmationDetails";
import { ConfirmationActions, ConfirmationLayout } from "@/common/Confirmation/ConfirmationLayout";
import {
	AmountRow,
	ConfirmationNote,
	ConfirmationSection,
} from "@/common/Confirmation/ConfirmationParts";
import { ShownAsset } from "@/common/Confirmation/ShownAsset";
import { UiButton } from "@/ui/UiButton/base";

export const PROCESS_CT_CONFIRMATION_KIND = "liquid.processConfidentialTransaction";

export type KnownAsset = { decimals: number; ticker: string };

export type ProcessCtConfirmationData = {
	assets: Record<string, KnownAsset>;
	broadcast: boolean;
	kind: typeof PROCESS_CT_CONFIRMATION_KIND;
	network: string;
	shown: ShownConfirmation;
};

const ROW_KINDS = new Set(["address", "change", "data", "program", "wallet"]);

const ORIGINS = new Set(["computed", "dapp", "verified"]);

const UNSIGNED = /^\d+$/;
const SIGNED = /^-?\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function provenanced(value: unknown, carries: (held: unknown) => boolean): boolean {
	return isRecord(value) && ORIGINS.has(value.origin as string) && carries(value.value);
}

const provenancedString = (value: unknown): boolean =>
	provenanced(value, (held) => typeof held === "string");
const provenancedBoolean = (value: unknown): boolean =>
	provenanced(value, (held) => typeof held === "boolean");
const provenancedAmount = (value: unknown, pattern: RegExp): boolean =>
	provenanced(value, (held) => typeof held === "string" && pattern.test(held));

function everyRow(value: unknown, row: (entry: unknown) => boolean): boolean {
	return Array.isArray(value) && value.every((entry) => row(entry));
}

export function isProcessCtConfirmationData(value: unknown): value is ProcessCtConfirmationData {
	if (!isRecord(value) || value.kind !== PROCESS_CT_CONFIRMATION_KIND) {
		return false;
	}

	if (
		typeof value.broadcast !== "boolean" ||
		typeof value.network !== "string" ||
		!isRecord(value.assets) ||
		!Object.values(value.assets).every(
			(known) =>
				isRecord(known) && typeof known.ticker === "string" && typeof known.decimals === "number",
		)
	) {
		return false;
	}

	const shown = value.shown;

	if (!isRecord(shown)) {
		return false;
	}

	return (
		provenancedString(shown.account) &&
		provenancedString(shown.action) &&
		provenancedString(shown.protocol) &&
		provenancedString(shown.feeAsset) &&
		provenancedAmount(shown.feeSats, UNSIGNED) &&
		everyRow(
			shown.netEffect,
			(row) => isRecord(row) && provenancedString(row.asset) && provenancedAmount(row.sats, SIGNED),
		) &&
		everyRow(shown.inputs, isFlowRow) &&
		everyRow(shown.outputs, isFlowRow) &&
		everyRow(
			shown.programs,
			(row) =>
				isRecord(row) &&
				provenancedString(row.address) &&
				provenancedString(row.cmr) &&
				provenancedString(row.tapleafHash) &&
				provenancedString(row.utxoType) &&
				provenancedBoolean(row.verified),
		) &&
		everyRow(
			shown.blindedAmounts,
			(row) => isRecord(row) && provenancedString(row.id) && provenancedString(row.decidedBy),
		) &&
		everyRow(
			shown.publishedAmounts,
			(row) => isRecord(row) && provenancedString(row.id) && provenancedString(row.reason),
		) &&
		(shown.summary === undefined || provenancedString(shown.summary))
	);
}

function isFlowRow(row: unknown): boolean {
	return (
		isRecord(row) &&
		ROW_KINDS.has(row.kind as string) &&
		provenancedString(row.asset) &&
		provenancedAmount(row.sats, UNSIGNED) &&
		(row.name === undefined || provenancedString(row.name)) &&
		(row.address === undefined || provenancedString(row.address)) &&
		(row.dataBytes === undefined || typeof row.dataBytes === "number")
	);
}

export function ProcessCtConfirmation({
	data,
	origin,
	onConfirm,
	onReject,
}: {
	data: ProcessCtConfirmationData;
	origin?: string;
	onConfirm: () => void;
	onReject: () => void;
}) {
	const { shown } = data;
	const assetOf = (id: string) => {
		const known = data.assets[id];

		return new ShownAsset(id, known?.ticker, known?.decimals);
	};

	return (
		<ConfirmationLayout
			origin={origin}
			network={data.network}
			title={readable(shown.action.value)}
			statement={shown.summary?.value}
			statementByDapp={shown.summary === undefined ? undefined : "Described by the dapp"}
			footer={
				<ConfirmationActions
					signer={`Signing with ${shown.account.value}`}
					confirmLabel={data.broadcast ? "Sign and send" : "Sign"}
					onReject={onReject}
					onConfirm={onConfirm}
				/>
			}
		>
			<ConfirmationSection title="Balance changes">
				{shown.netEffect.map((effect) => (
					<AmountRow
						key={effect.asset.value}
						asset={assetOf(effect.asset.value)}
						units={BigInt(effect.sats.value)}
					/>
				))}
			</ConfirmationSection>
			<ConfirmationSection
				title="Network fee"
				aside={
					<span className="font-mono text-sm font-semibold tabular-nums">
						{shown.feeSats.value} sats
					</span>
				}
			/>
			{shown.publishedAmounts.length > 0 && (
				<ConfirmationNote>
					The change stays unblinded on-chain, so the next action can spend those funds.
				</ConfirmationNote>
			)}
			{!data.broadcast && (
				<ConfirmationNote>
					The wallet signs the transaction and hands the result back to the dapp to send.
				</ConfirmationNote>
			)}
			<ConfirmationDetails
				summary={`${count(shown.inputs.length, "input")} · ${count(shown.outputs.length, "output")}`}
			>
				<DetailsGroup title="Inputs">
					{shown.inputs.map((row, at) => (
						<FlowDetailsRow key={at} index={at + 1} row={row} assetOf={assetOf} />
					))}
				</DetailsGroup>
				<DetailsGroup title="Outputs">
					{shown.outputs.map((row, at) => (
						<FlowDetailsRow key={at} index={at + 1} row={row} assetOf={assetOf} />
					))}
				</DetailsGroup>
				{shown.programs.length > 0 && (
					<DetailsGroup title="Contracts">
						{shown.programs.map((program) => (
							<DetailsRow
								key={program.address.value}
								label={readable(program.utxoType.value)}
								note={program.cmr.value}
								value={program.verified.value ? "On-chain" : "New"}
							/>
						))}
					</DetailsGroup>
				)}
			</ConfirmationDetails>
		</ConfirmationLayout>
	);
}

function FlowDetailsRow({
	index,
	row,
	assetOf,
}: {
	index: number;
	row: ShownFlowRow;
	assetOf: (id: string) => ShownAsset;
}) {
	const amount = assetOf(row.asset.value).amountWithLabel(BigInt(row.sats.value));

	switch (row.kind) {
		case "wallet": {
			return <DetailsRow index={index} label="This account" value={amount} />;
		}

		case "change": {
			return <DetailsRow index={index} label="This account, change" value={amount} />;
		}

		case "data": {
			return (
				<DetailsRow
					index={index}
					label={readable(row.name?.value ?? "Data")}
					note="Provided by the dapp"
					noteByDapp
					value={`${row.dataBytes ?? 0} bytes`}
				/>
			);
		}

		default: {
			return (
				<DetailsRow
					index={index}
					label={readable(row.name?.value ?? "")}
					note={row.address === undefined ? undefined : shortAddress(row.address.value)}
					noteByDapp={row.address?.origin === "dapp"}
					value={amount}
				/>
			);
		}
	}
}

export function ProcessCtUnreadable({
	origin,
	network,
	onClose,
}: {
	origin?: string;
	network?: string;
	onClose: () => void;
}) {
	return (
		<ConfirmationLayout
			origin={origin}
			network={network}
			title="This request can't be shown"
			statement="The wallet could not read what the dapp asked for, so nothing was signed or sent."
			footer={
				<UiButton type="button" variant="outline" className="h-11" onClick={onClose}>
					Close
				</UiButton>
			}
		/>
	);
}

export function readable(name: string): string {
	const words = name
		.replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replaceAll(/[_-]+/g, " ")
		.trim()
		.toLowerCase();

	return words.charAt(0).toUpperCase() + words.slice(1);
}

function shortAddress(address: string): string {
	return address.length <= 16 ? address : `${address.slice(0, 8)}…${address.slice(-4)}`;
}

function count(amount: number, noun: string): string {
	return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

export const processCtConfirmationRenderer: ConfirmationRenderer = {
	kind: PROCESS_CT_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) => {
		const data: unknown = request.data;

		if (!isRecord(data) || data.kind !== PROCESS_CT_CONFIRMATION_KIND) {
			return null;
		}

		return isProcessCtConfirmationData(data) ? (
			<ProcessCtConfirmation
				data={data}
				origin={request.requester?.origin}
				onConfirm={() => onConfirm()}
				onReject={onDecline}
			/>
		) : (
			<ProcessCtUnreadable
				origin={request.requester?.origin}
				network={typeof data.network === "string" ? data.network : undefined}
				onClose={onDecline}
			/>
		);
	},
};
