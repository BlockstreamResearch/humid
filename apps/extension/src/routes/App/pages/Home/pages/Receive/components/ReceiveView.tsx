import { ArrowLeft01Icon, CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import QRCode from "react-qr-code";

import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";

/**
 * Presentational Receive screen: the account's receive address as a QR (always dark
 * on white for scannability) plus a copyable string, for the selected account/chain.
 */
export function ReceiveView({
	address,
	accountName,
	chainName,
}: {
	address: string;
	accountName: string;
	chainName: string;
}) {
	return (
		<div className="flex size-full min-h-0 flex-col">
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

			<div className="flex flex-1 flex-col items-center gap-5 px-5 py-6 text-center">
				<p className="text-muted-foreground text-sm">
					{accountName} · {chainName}
				</p>

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
		</div>
	);
}
