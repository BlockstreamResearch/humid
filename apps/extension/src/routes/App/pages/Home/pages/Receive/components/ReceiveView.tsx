import {
	ArrowLeft01Icon,
	CheckmarkCircle02Icon,
	Copy01Icon,
	InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import QRCode from "react-qr-code";

import type { LiquidContractIdentity } from "@/core/chains/liquid/application/contractIdentity";
import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";
import { UiScrollArea } from "@/ui/UiScrollArea";
import { UiSpinner } from "@/ui/UiSpinner";
import { UiTabs, UiTabsContent, UiTabsList, UiTabsTrigger } from "@/ui/UiTabs/base";
import { UiTooltip, UiTooltipContent, UiTooltipProvider, UiTooltipTrigger } from "@/ui/UiTooltip";

const CONFIDENTIAL_TAB = "confidential";
const UNCONFIDENTIAL_TAB = "unconfidential";

/** A label and the sentence that says what the value under it is for. */
function LabelWithHint({ hint, label }: { hint: string; label: string }) {
	return (
		<div className="flex items-center justify-center gap-1.5">
			<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				{label}
			</span>
			<UiTooltip>
				<UiTooltipTrigger
					aria-label={`What ${label.toLowerCase()} is for`}
					className="text-muted-foreground hover:text-foreground rounded-full transition-colors"
				>
					<HugeiconsIcon icon={InformationCircleIcon} size={14} />
				</UiTooltipTrigger>
				<UiTooltipContent>{hint}</UiTooltipContent>
			</UiTooltip>
		</div>
	);
}

/** One address as a QR, its own text, and a way to take it out. */
function AddressPanel({ address, hint, label }: { address: string; hint: string; label: string }) {
	return (
		<div className="flex flex-col items-center gap-4">
			<LabelWithHint hint={hint} label={label} />

			<div className="rounded-xl border bg-white p-3">
				<QRCode value={address} size={176} bgColor="#ffffff" fgColor="#000000" />
			</div>

			<p className="text-muted-foreground max-w-full font-mono text-xs break-all">{address}</p>

			<UiCopyButton
				className={cn(UiButtonVariants({ variant: "outline", size: "lg" }), "w-full")}
				value={address}
			>
				{(copied) => (
					<>
						<HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} size={18} />
						{copied ? "Copied" : "Copy address"}
					</>
				)}
			</UiCopyButton>
		</div>
	);
}

/** A value that is not an address: shown as text, with the same label and hint treatment. */
function ValueRow({ hint, label, value }: { hint: string; label: string; value: string }) {
	return (
		<div className="border-border/60 flex w-full flex-col items-center gap-2 border-t pt-4">
			<LabelWithHint hint={hint} label={label} />
			<p className="text-muted-foreground max-w-full font-mono text-xs break-all">{value}</p>
			<UiCopyButton
				className={cn(UiButtonVariants({ variant: "ghost", size: "sm" }))}
				value={value}
			>
				{(copied) => (
					<>
						<HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} size={14} />
						{copied ? "Copied" : "Copy key"}
					</>
				)}
			</UiCopyButton>
		</div>
	);
}

/**
 * Presentational Receive screen.
 *
 * Two addresses rather than one, because this wallet has two and they are not
 * interchangeable. The confidential one is blinded and moves along the descriptor; the
 * unconfidential one is unblinded and fixed at the first external index, and is the only
 * one a contract action can be funded from. Money paid to the first cannot pay for one,
 * which is a thing to learn before a faucet payment rather than after.
 *
 * They are named for what they are rather than for what they are used for: the difference
 * that decides which one to pay is blinding and derivation, and a reader who knows that
 * needs no product word for it.
 *
 * The unconfidential address is read only once its tab is opened: answering loads the
 * contract module, which is several megabytes, and most visits here only want an address.
 *
 * The page owns its own scroll, per the app shell's contract — the shell bounds the region
 * and pins the footer beneath it, so anything taller than the popup has to scroll here.
 */
export function ReceiveView({
	address,
	accountName,
	chainName,
	contractIdentity,
	contractError,
	onContractOpened,
}: {
	address: string;
	accountName: string;
	chainName: string;
	contractIdentity?: LiquidContractIdentity;
	contractError?: string;
	onContractOpened?: () => void;
}) {
	return (
		<UiTooltipProvider>
			<div className="flex size-full min-h-0 flex-col overflow-hidden">
				<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-2.5">
					<Link
						to="/app"
						aria-label="Back"
						className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors"
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
					</Link>
					<p className="text-sm font-semibold">Receive</p>
				</header>

				<UiScrollArea className="min-h-0 flex-1">
					<div className="flex flex-col items-center gap-5 px-5 py-6 text-center">
						<p className="text-muted-foreground text-sm">
							{accountName} · {chainName}
						</p>

						<UiTabs
							defaultValue={CONFIDENTIAL_TAB}
							className="w-full"
							onValueChange={(value) => {
								if (value === UNCONFIDENTIAL_TAB) {
									onContractOpened?.();
								}
							}}
						>
							<UiTabsList className="w-full">
								<UiTabsTrigger value={CONFIDENTIAL_TAB}>Confidential</UiTabsTrigger>
								<UiTabsTrigger value={UNCONFIDENTIAL_TAB}>Unconfidential</UiTabsTrigger>
							</UiTabsList>

							<UiTabsContent value={CONFIDENTIAL_TAB} className="mt-5">
								<AddressPanel
									address={address}
									hint="Blinded, and derived one further along the descriptor each time you look. Amounts and assets paid to it are readable only with this wallet's blinding key."
									label="Confidential address"
								/>
							</UiTabsContent>

							<UiTabsContent value={UNCONFIDENTIAL_TAB} className="mt-5">
								{contractError === undefined ? null : (
									<p className="text-destructive text-xs">{contractError}</p>
								)}

								{contractError === undefined && contractIdentity === undefined ? (
									<div className="flex justify-center py-10">
										<UiSpinner />
									</div>
								) : null}

								{contractIdentity === undefined ? null : (
									<div className="flex flex-col items-center gap-4">
										<AddressPanel
											address={contractIdentity.address}
											hint="Unblinded, and fixed at the first index of the external chain. Contract actions are funded from here and return their change here; amounts paid to it are public."
											label="Unconfidential address"
										/>
										<ValueRow
											hint="The x-only public key of the same index, which a covenant parameterised on this wallet's key takes. Public."
											label="Signing public key (x-only)"
											value={contractIdentity.schnorrPublicKey}
										/>
									</div>
								)}
							</UiTabsContent>
						</UiTabs>
					</div>
				</UiScrollArea>
			</div>
		</UiTooltipProvider>
	);
}
