import {
	CheckmarkCircle02Icon,
	Copy01Icon,
	InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import QRCode from "react-qr-code";

import { Page } from "@/common/Page";
import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";
import { UiTabs, UiTabsContent, UiTabsList, UiTabsTrigger } from "@/ui/UiTabs/base";
import { UiTooltip, UiTooltipContent, UiTooltipProvider, UiTooltipTrigger } from "@/ui/UiTooltip";

const CONFIDENTIAL_TAB = "confidential";
const EXPLICIT_TAB = "explicit";

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

export function ReceiveView({
	address,
	accountName,
	chainName,
	explicit,
}: {
	address: string;
	accountName: string;
	chainName: string;
	explicit: string;
}) {
	return (
		<UiTooltipProvider>
			<Page back={{ label: "Back", to: "/app" }} title="Receive">
				<div className="flex flex-col items-center gap-5 px-5 py-6 text-center">
					<p className="text-muted-foreground text-sm">
						{accountName} · {chainName}
					</p>

					<UiTabs defaultValue={CONFIDENTIAL_TAB} className="w-full">
						<UiTabsList className="w-full">
							<UiTabsTrigger value={CONFIDENTIAL_TAB}>Confidential</UiTabsTrigger>
							<UiTabsTrigger value={EXPLICIT_TAB}>Explicit</UiTabsTrigger>
						</UiTabsList>

						<UiTabsContent value={CONFIDENTIAL_TAB} className="mt-5">
							<AddressPanel
								address={address}
								hint="A private address. Only this wallet can see the amounts and assets sent here. Once a payment arrives, the next unused address takes its place."
								label="Confidential address"
							/>
						</UiTabsContent>

						<UiTabsContent value={EXPLICIT_TAB} className="mt-5">
							<AddressPanel
								address={explicit}
								hint="A public address. Anyone can see the amounts and assets sent here. This address never changes."
								label="Explicit address"
							/>
						</UiTabsContent>
					</UiTabs>
				</div>
			</Page>
		</UiTooltipProvider>
	);
}
