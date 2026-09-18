import { describeOrigin, type Provenanced, type ShownConfirmation } from "@humid/tx-manifest";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UiButton } from "@/ui/UiButton/base";

export const PROCESS_CT_CONFIRMATION_KIND = "liquid.processConfidentialTransaction";

export type ProcessCtConfirmationData = {
	broadcast: boolean;
	kind: typeof PROCESS_CT_CONFIRMATION_KIND;
	shown: ShownConfirmation;
};

const ORIGINS = new Set(["chain", "computed", "dapp", "verified"]);

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

	if (typeof value.broadcast !== "boolean") {
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
		everyRow(
			shown.covenants,
			(row) =>
				isRecord(row) &&
				provenancedString(row.address) &&
				provenancedString(row.cmr) &&
				provenancedString(row.tapleafHash) &&
				provenancedString(row.utxoType) &&
				provenancedBoolean(row.verified),
		) &&
		everyRow(
			shown.hiddenAmounts,
			(row) => isRecord(row) && provenancedString(row.id) && provenancedString(row.decidedBy),
		) &&
		everyRow(
			shown.publishedAmounts,
			(row) => isRecord(row) && provenancedString(row.id) && provenancedString(row.reason),
		) &&
		(shown.summary === undefined || provenancedString(shown.summary))
	);
}

function Shown({ label, value }: { label: string; value: Provenanced<string> }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				{label}
			</span>
			<span className="text-sm font-medium break-all">{value.value}</span>
			<span className="text-muted-foreground text-xs">{describeOrigin(value.origin)}</span>
		</div>
	);
}

function amount(value: string): string {
	const sats = BigInt(value);

	return `${sats < 0n ? "−" : "+"}${decimal(sats)} L-BTC`;
}

export function feeLine(value: string): string {
	return `${decimal(BigInt(value))} L-BTC`;
}

function decimal(sats: bigint): string {
	const whole = (sats < 0n ? -sats : sats).toString().padStart(9, "0");

	return `${whole.slice(0, -8)}.${whole.slice(-8)}`.replace(/\.?0+$/, "") || "0";
}

export function netEffectLine(
	effect: { asset: string; sats: string },
	feeAsset: string,
): { asset?: string; shown: string } {
	return effect.asset === feeAsset
		? { shown: amount(effect.sats) }
		: { asset: effect.asset, shown: units(effect.sats) };
}

function units(value: string): string {
	const sats = BigInt(value);

	return `${sats < 0n ? "−" : "+"}${(sats < 0n ? -sats : sats).toString()}`;
}

export function ProcessCtUnreadable({ onDecline }: { onDecline: () => void }) {
	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">This cannot be shown to you</h2>
				<p className="text-muted-foreground mt-1 text-sm">
					The wallet could not read what it was asked to put on this screen, so it will not ask you
					to approve it. Nothing has been signed and nothing has been sent.
				</p>
			</header>

			<div className="flex items-center gap-3 p-4 pt-3">
				<UiButton type="button" variant="outline" className="flex-1" onClick={onDecline}>
					Close
				</UiButton>
			</div>
		</div>
	);
}

export function ProcessCtConfirmation({
	data,
	onConfirm,
	onDecline,
}: {
	data: ProcessCtConfirmationData;
	onConfirm: () => void;
	onDecline: () => void;
}) {
	const { shown } = data;

	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="p-4 pb-3 text-center">
				<h2 className="cn-font-heading text-xl font-bold">Perform a contract action?</h2>
				<p className="text-muted-foreground mt-1 text-sm">
					{data.broadcast
						? "Nothing is signed until you agree, and what you agree to is what gets signed and sent."
						: "Nothing is signed until you agree, and what you agree to is what gets signed. This one is handed back to the dapp rather than sent."}
				</p>
			</header>

			<div className="flex-1 space-y-5 overflow-y-auto px-4">
				{shown.netEffect.map((effect) => {
					const line = netEffectLine(
						{ asset: effect.asset.value, sats: effect.sats.value },
						shown.feeAsset.value,
					);

					return (
						<div className="flex flex-col gap-1" key={effect.asset.value}>
							<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
								This wallet
							</span>
							<span className="text-lg font-semibold">{line.shown}</span>
							{line.asset === undefined ? null : (
								<span className="text-muted-foreground text-xs break-all">{line.asset}</span>
							)}
							<span className="text-muted-foreground text-xs">
								{describeOrigin(effect.sats.origin)}
							</span>
						</div>
					);
				})}

				<Shown
					label="Network fee"
					value={{ ...shown.feeSats, value: feeLine(shown.feeSats.value) } as Provenanced<string>}
				/>
				<Shown label="Acting account" value={shown.account} />

				{shown.hiddenAmounts.map((hidden) => (
					<div className="flex flex-col gap-1" key={hidden.id.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Amount hidden onchain
						</span>
						<span className="text-sm font-medium break-all">{hidden.id.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(hidden.id.origin)}
						</span>
						<span className="text-sm">{hidden.decidedBy.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(hidden.decidedBy.origin)}
						</span>
					</div>
				))}

				{shown.publishedAmounts.map((published) => (
					<div className="flex flex-col gap-1" key={published.id.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Amount published onchain
						</span>
						<span className="text-sm font-medium break-all">{published.id.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(published.id.origin)}
						</span>
						<span className="text-sm">{published.reason.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(published.reason.origin)}
						</span>
					</div>
				))}

				{shown.covenants.map((covenant) => (
					<div className="flex flex-col gap-1" key={covenant.address.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							{covenant.verified.value ? "Contract, checked" : "Contract, not yet onchain"}
						</span>
						<span className="font-mono text-xs break-all">{covenant.address.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(covenant.address.origin)}
						</span>
						<span className="text-sm">{covenant.utxoType.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(covenant.utxoType.origin)}
						</span>
						{/* The address says where the funds sit and moves with the arguments and the
						    network. These say what the contract is, so a person who has seen this
						    contract before has something that does not change to recognise it by. */}
						<span className="text-muted-foreground text-xs">Contract hash</span>
						<span className="font-mono text-xs break-all">{covenant.cmr.value}</span>
						<span className="text-muted-foreground text-xs">Leaf it is spent from</span>
						<span className="font-mono text-xs break-all">{covenant.tapleafHash.value}</span>
					</div>
				))}

				<Shown label="Protocol" value={shown.protocol} />
				<Shown label="Action" value={shown.action} />
				{shown.summary === undefined ? null : (
					<Shown label="What the dapp says this does" value={shown.summary} />
				)}
			</div>

			<div className="flex items-center gap-3 p-4 pt-3">
				<UiButton type="button" variant="outline" className="flex-1" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton type="button" className="flex-1" onClick={onConfirm}>
					{data.broadcast ? "Sign and send" : "Sign"}
				</UiButton>
			</div>
		</div>
	);
}

export const processCtConfirmationRenderer: ConfirmationRenderer = {
	kind: PROCESS_CT_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) => {
		const data: unknown = request.data;

		if (!isRecord(data) || data.kind !== PROCESS_CT_CONFIRMATION_KIND) {
			return null;
		}

		return isProcessCtConfirmationData(data) ? (
			<ProcessCtConfirmation data={data} onConfirm={() => onConfirm()} onDecline={onDecline} />
		) : (
			<ProcessCtUnreadable onDecline={onDecline} />
		);
	},
};
