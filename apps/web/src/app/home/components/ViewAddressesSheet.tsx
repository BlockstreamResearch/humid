import type {
	LiquidGetWalletDescriptorResult,
	LiquidWalletDescriptorEntry,
} from "@humid/appkit-injected-adapter";
import { Loader2Icon, RefreshCwIcon, ScrollTextIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { ResultField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** The capability flags a descriptor entry exposes, rendered as small badges. */
const CAPABILITY_FLAGS: Array<{ key: keyof LiquidWalletDescriptorEntry; label: string }> = [
	{ key: "canDeriveScriptPubKeys", label: "Derive scripts" },
	{ key: "canDeriveConfidentialAddresses", label: "Derive addresses" },
	{ key: "canUnblindOutputs", label: "Unblind outputs" },
];

/** Read the approved public wallet descriptor(s) for the connected account; loads on open. */
export function ViewAddressesSheet({ open, onOpenChange }: OverlayProps) {
	const { wallet } = useHumidContext();
	const action = useAsyncAction<LiquidGetWalletDescriptorResult>();
	const pending = action.status === "pending";

	const load = async () => {
		const result = await action.run(() =>
			wallet.getWalletDescriptor({
				descriptorFormat: [{ format: "bip380-bip389-multipath" }],
				descriptorType: "publicWalletDescriptor",
			}),
		);
		if (!result.ok) toast.error("Couldn't load descriptor", { description: result.error });
	};

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		// Reset after the close animation so the list doesn't flash mid-exit.
		if (!next) window.setTimeout(action.reset, 250);
	};

	// Fetch once when the sheet opens; a manual reload is available in the footer.
	useEffect(() => {
		if (open && action.status === "idle") void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const descriptors = action.status === "success" && action.data ? action.data.descriptors : [];

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="gap-0">
				<SheetHeader>
					<SheetTitle>Wallet addresses</SheetTitle>
					<SheetDescription>
						The approved public descriptor the wallet derives addresses from.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
					{action.status === "error" && action.error ? (
						<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs">
							{action.error}
						</p>
					) : pending ? (
						<div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
							<Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
							Loading descriptor…
						</div>
					) : descriptors.length === 0 && action.status === "success" ? (
						<div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
							<ScrollTextIcon className="size-6 opacity-60" />
							No descriptor available.
						</div>
					) : (
						descriptors.map((entry) => (
							<div
								key={entry.descriptor ?? `${entry.descriptorType}-${entry.format}`}
								className="border-border flex flex-col gap-3 rounded-lg border p-4"
							>
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="secondary">{entry.descriptorType}</Badge>
									<Badge variant="outline">{entry.format}</Badge>
									<Badge variant="outline">{entry.branchLayout}</Badge>
								</div>

								<div className="flex flex-wrap gap-1.5">
									{CAPABILITY_FLAGS.map(({ key, label }) => (
										<Badge key={key} variant={entry[key] ? "secondary" : "outline"}>
											{label}: {entry[key] ? "yes" : "no"}
										</Badge>
									))}
								</div>

								{entry.descriptor ? (
									<ResultField label="Descriptor" value={entry.descriptor} />
								) : null}
								{entry.branchDescriptors?.map((branch) => (
									<ResultField
										key={branch.branch}
										label={`Descriptor (${branch.branch})`}
										value={branch.descriptor}
									/>
								))}
							</div>
						))
					)}
				</div>

				<SheetFooter>
					<Button variant="outline" disabled={pending} onClick={() => void load()}>
						{pending ? (
							<>
								<Loader2Icon className="animate-spin motion-reduce:animate-none" />
								Loading…
							</>
						) : (
							<>
								<RefreshCwIcon />
								Reload
							</>
						)}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
