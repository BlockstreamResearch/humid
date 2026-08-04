import { describeOrigin, type ShownConfirmation } from "@humid/tx-manifest";
import type { Provenanced } from "@humid/tx-manifest";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UiButton } from "@/ui/UiButton/base";

/** What the method puts on the confirmation payload, and how this surface recognises it. */
export const PROCESS_CT_CONFIRMATION_KIND = "liquid.processConfidentialTransaction";

export type ProcessCtConfirmationData = {
	broadcast: boolean;
	kind: typeof PROCESS_CT_CONFIRMATION_KIND;
	shown: ShownConfirmation;
};

export function isProcessCtConfirmationData(value: unknown): value is ProcessCtConfirmationData {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { kind?: unknown }).kind === PROCESS_CT_CONFIRMATION_KIND &&
		typeof (value as { shown?: unknown }).shown === "object"
	);
}

/**
 * One value, shown with where it came from.
 *
 * Every value on this surface goes through here, which is the whole point: the component
 * takes a provenanced value and nothing else, so a plain string cannot be rendered without
 * someone changing this signature. The origin is words rather than a colour or a badge,
 * because "claimed by the site" is the thing that has to be unmistakable and a badge is the
 * thing people stop seeing.
 */
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

/**
 * Base units as a person reads them, keeping the sign that says which way the money goes.
 *
 * Takes the decimal string the wire form carries rather than a bigint: the model crosses
 * a JSON boundary to get here, and JSON cannot carry one.
 */
function amount(value: string): string {
	const sats = BigInt(value);
	const negative = sats < 0n;
	const whole = (negative ? -sats : sats).toString().padStart(9, "0");
	const point = `${whole.slice(0, -8)}.${whole.slice(-8)}`.replace(/\.?0+$/, "");

	return `${negative ? "−" : "+"}${point || "0"} L-BTC`;
}

/**
 * What a person is asked to approve before a contract action is signed.
 *
 * The four facts the wallet established for itself come first and the protocol's own words
 * come after, each labelled with where it came from. They are not separated into two
 * screens deliberately: a first screen reads as the summary and a second as the detail, and
 * the distinction that matters here is not importance but authorship.
 */
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
					Nothing is signed until you agree, and what you agree to is what gets signed.
				</p>
			</header>

			<div className="flex-1 space-y-5 overflow-y-auto px-4">
				{shown.netEffect.map((effect) => (
					<div className="flex flex-col gap-1" key={effect.asset.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							This wallet
						</span>
						<span className="text-lg font-semibold">{amount(effect.sats.value)}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(effect.sats.origin)}
						</span>
					</div>
				))}

				<Shown
					label="Network fee"
					value={{ ...shown.feeSats, value: amount(shown.feeSats.value) } as Provenanced<string>}
				/>
				<Shown label="Acting account" value={shown.account} />

				{shown.covenants.map((covenant) => (
					<div className="flex flex-col gap-1" key={covenant.address.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							{covenant.verified.value ? "Contract, checked" : "Contract, not yet on chain"}
						</span>
						<span className="font-mono text-xs break-all">{covenant.address.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(covenant.address.origin)}
						</span>
					</div>
				))}

				{/* Everything below is the site's own words. It is shown because a person deciding
				    needs to know what the site says it is doing — and labelled, because the wallet
				    checked none of it. */}
				<Shown label="Protocol" value={shown.protocol} />
				<Shown label="Action" value={shown.action} />
				{shown.summary === undefined ? null : (
					<Shown label="What the site says this does" value={shown.summary} />
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

/** Plugs this confirmation into the generic host (see ConfirmProvider). */
export const processCtConfirmationRenderer: ConfirmationRenderer = {
	kind: PROCESS_CT_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isProcessCtConfirmationData(request.data) ? (
			<ProcessCtConfirmation
				data={request.data}
				onConfirm={() => onConfirm()}
				onDecline={onDecline}
			/>
		) : null,
};
