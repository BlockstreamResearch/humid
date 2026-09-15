import { describeOrigin, type Provenanced, type ShownConfirmation } from "@humid/tx-manifest";

import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UiButton } from "@/ui/UiButton/base";

/** What the method puts on the confirmation payload, and how this surface recognises it. */
export const PROCESS_CT_CONFIRMATION_KIND = "liquid.processConfidentialTransaction";

export type ProcessCtConfirmationData = {
	/**
	 * Whether agreeing also sends this transaction, which is what the request asked for.
	 *
	 * On the payload rather than left to the screen, because it is the request's word and not
	 * this surface's: two different things are being agreed to — a signature handed back, or a
	 * signature broadcast — and one button labelled for both would be describing something this
	 * screen does not know.
	 */
	broadcast: boolean;
	kind: typeof PROCESS_CT_CONFIRMATION_KIND;
	shown: ShownConfirmation;
};

/**
 * The origins a value can carry, as they arrive over the bus.
 *
 * Written here rather than imported as a type, because a type cannot check a string that
 * crossed a JSON boundary. It is the same vocabulary the package publishes in words through
 * `describeOrigin`, and a value carrying anything else never came from that package.
 */
const ORIGINS = new Set(["chain", "computed", "site", "verified"]);

/** A whole number of base units, unsigned — what a fee is written as. */
const UNSIGNED = /^\d+$/;
/** The same, with the sign that says which way a balance moved. */
const SIGNED = /^-?\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** One value with an origin on it, checked as far as a runtime can check it. */
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

/**
 * Whether this payload is one this surface can render, checked all the way down.
 *
 * The kind alone is not enough and the difference matters here more than it usually would.
 * The host picks a body by kind and shows whatever it picked; there is no second body behind
 * this one. So a payload that says the right kind and then carries a half-built model would
 * reach the markup below and throw inside it — after the person was already looking at a
 * confirmation screen. Every field is checked before that, and a payload that fails any of
 * them is refused rather than partly rendered.
 *
 * Shape rather than sense. That a fee is a whole number of base units is something this
 * surface can see; that it is the right fee is not, and pretending to check it here would put
 * a second, weaker answer beside the one the review already established.
 */
export function isProcessCtConfirmationData(value: unknown): value is ProcessCtConfirmationData {
	if (!isRecord(value) || value.kind !== PROCESS_CT_CONFIRMATION_KIND) {
		return false;
	}

	// Checked rather than defaulted. A payload that omits it is one this surface cannot say
	// which of the two questions it is asking, and defaulting to the quieter answer would put
	// "Sign" on a screen that is about to broadcast.
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
		// Unsigned: a fee is what the transaction costs, and a negative cost is not a figure
		// this wallet ever produces or could put a sentence to.
		provenancedAmount(shown.feeSats, UNSIGNED) &&
		everyRow(
			shown.netEffect,
			(row) =>
				isRecord(row) &&
				provenancedString(row.asset) &&
				// Signed, because which way the money goes is the whole of what this line says.
				provenancedAmount(row.sats, SIGNED),
		) &&
		everyRow(
			shown.covenants,
			(row) =>
				isRecord(row) &&
				provenancedString(row.address) &&
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

	return `${sats < 0n ? "−" : "+"}${decimal(sats)} L-BTC`;
}

/**
 * The fee, written without a sign.
 *
 * The balance lines carry one because they say which way money moved; the fee is what this
 * transaction costs. Sharing the balance formatter printed the cost as a gain — "+0.00000108
 * L-BTC" directly under "−0.00000108 L-BTC", the same figure twice with opposite signs.
 */
export function feeLine(value: string): string {
	return `${decimal(BigInt(value))} L-BTC`;
}

/** One L-BTC figure, unsigned, with trailing zeros trimmed. */
function decimal(sats: bigint): string {
	const whole = (sats < 0n ? -sats : sats).toString().padStart(9, "0");

	return `${whole.slice(0, -8)}.${whole.slice(-8)}`.replace(/\.?0+$/, "") || "0";
}

/**
 * One line of the balance change, in whichever terms this wallet can honestly write it.
 *
 * A pure function rather than a branch inside the markup, because this is the one decision on
 * this surface that can be got wrong quietly: printing a token's units under the network
 * asset's name reads as money and is not, and there is no rendering test in this project that
 * would catch it.
 */
export function netEffectLine(
	effect: { asset: string; sats: string },
	feeAsset: string,
): { asset?: string; shown: string } {
	return effect.asset === feeAsset
		? { shown: amount(effect.sats) }
		: { asset: effect.asset, shown: units(effect.sats) };
}

/**
 * The same figure in an asset this wallet knows nothing else about.
 *
 * Base units and a sign, and no name and no decimal point: how many places a protocol's own
 * token divides into is the protocol's business, and a wallet guessing eight of them would
 * print a hundredth of a token as a whole one. The id sits beside it, which is the only thing
 * about that asset this wallet actually established.
 */
function units(value: string): string {
	const sats = BigInt(value);

	return `${sats < 0n ? "−" : "+"}${(sats < 0n ? -sats : sats).toString()}`;
}

/**
 * What is shown when the payload is this surface's own and cannot be read.
 *
 * There is no approving from here and there is no button that could lead to one: a person
 * cannot agree to something nobody can describe, and a screen that offered the choice anyway
 * would be asking them to trust the wallet in the one situation where the wallet has just
 * said it does not know what it is looking at.
 */
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

/**
 * What a person is asked to approve before a contract action is signed.
 *
 * The facts the wallet established for itself come first and the protocol's own words come
 * after, each labelled with where it came from. They are not separated into two screens
 * deliberately: a first screen reads as the summary and a second as the detail, and the
 * distinction that matters here is not importance but authorship.
 *
 * What this screen asks for is authorisation, and it says which of the two authorisations it
 * is: handing the signed transaction back to the site, or sending it. The request states that
 * and the screen repeats it, because a person agreeing to a signature that goes nowhere and a
 * person agreeing to money moving are agreeing to different things.
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
					{data.broadcast
						? "Nothing is signed until you agree, and what you agree to is what gets signed and sent."
						: "Nothing is signed until you agree, and what you agree to is what gets signed. This one is handed back to the site rather than sent."}
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

				{/* What this transaction keeps off the chain, one line each, with whose word
				    decided it. The wallet hid these on someone's behalf, so it says so — and says
				    which of them the protocol asked for and which it simply never mentioned.
				    Two values, two attributions: the name is the protocol's word for an output and
				    the sentence under it is this wallet's reading of the document, and a single
				    label under the pair would put one of those two behind the other. */}
				{shown.hiddenAmounts.map((hidden) => (
					<div className="flex flex-col gap-1" key={hidden.id.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Amount hidden on chain
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

				{/* And what it publishes that the format would have kept off the chain: a contract
				    action's own change, which this wallet returns in the open so the money comes
				    back in a form the next action can be funded from. It says which word it set
				    aside to do that, because overriding a protocol quietly — here of all places,
				    where the person was just told to trust this wallet's reading of it — would be
				    worth less than not having told them anything. The name is attributed on its
				    own line for the same reason as above: here it is usually the wallet's own word
				    for its change rather than a name the document ever wrote. */}
				{shown.publishedAmounts.map((published) => (
					<div className="flex flex-col gap-1" key={published.id.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Amount published on chain
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

				{/* Each covenant with what the wallet established about it and what the protocol
				    calls it. The name is the site's own word and is labelled as one: a person
				    reading "p2pk_output" beside an address the wallet checked should be able to
				    tell which half of that line the wallet is standing behind. */}
				{shown.covenants.map((covenant) => (
					<div className="flex flex-col gap-1" key={covenant.address.value}>
						<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							{covenant.verified.value ? "Contract, checked" : "Contract, not yet on chain"}
						</span>
						<span className="font-mono text-xs break-all">{covenant.address.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(covenant.address.origin)}
						</span>
						<span className="text-sm">{covenant.utxoType.value}</span>
						<span className="text-muted-foreground text-xs">
							{describeOrigin(covenant.utxoType.origin)}
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

/**
 * Plugs this confirmation into the generic host (see ConfirmProvider).
 *
 * A payload of another kind renders nothing, which is how the host is told to keep looking.
 * A payload of this kind that cannot be read renders the refusal above instead: once the host
 * has selected a body by kind there is nothing behind it to fall back to, so returning
 * nothing there would leave a person facing an empty confirmation with no way to decline.
 */
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
