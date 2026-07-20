import type { LiquidSignPsetInput, LiquidSignPsetResult } from "@humid/appkit-injected-adapter";
import { CheckCircle2Icon, Loader2Icon, PenLineIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";
import { truncateMiddle } from "@/lib/liquid";

import { ResultField, TextAreaField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

const DEFAULT_SIGN_INPUTS = "[]";

/** Sign the listed inputs of a PSET, optionally broadcasting the finalized transaction. */
export function SignPsetSheet({ open, onOpenChange }: OverlayProps) {
	const { wallet } = useHumidContext();
	const broadcastId = useId();
	const [pset, setPset] = useState("");
	const [signInputs, setSignInputs] = useState(DEFAULT_SIGN_INPUTS);
	const [broadcast, setBroadcast] = useState(false);
	const action = useAsyncAction<LiquidSignPsetResult>();

	const canSign = pset.trim().length > 0;
	const pending = action.status === "pending";

	const resetForm = () => {
		setPset("");
		setSignInputs(DEFAULT_SIGN_INPUTS);
		setBroadcast(false);
		action.reset();
	};

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		// Reset after the close animation so the form doesn't flash mid-exit.
		if (!next) window.setTimeout(resetForm, 250);
	};

	const sign = async () => {
		const result = await action.run(() => {
			const inputs = JSON.parse(signInputs.trim() || DEFAULT_SIGN_INPUTS) as LiquidSignPsetInput[];
			return wallet.signPset({ broadcast, pset: pset.trim(), signInputs: inputs });
		});
		if (result.ok) {
			toast.success(result.data.txid ? "PSET signed & broadcast" : "PSET signed", {
				description: result.data.txid ? truncateMiddle(result.data.txid, 10, 8) : undefined,
			});
		} else {
			toast.error("Signing failed", { description: result.error });
		}
	};

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="gap-0">
				<SheetHeader>
					<SheetTitle>Sign PSET</SheetTitle>
					<SheetDescription>
						The wallet signs the listed inputs; over-signing is rejected.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-6 py-6">
					{action.status === "success" && action.data ? (
						<div className="flex flex-col gap-4">
							<div className="flex items-center gap-3">
								<CheckCircle2Icon className="size-5 text-emerald-500" />
								<div className="flex flex-col">
									<span className="text-sm font-medium">PSET signed</span>
									<span className="text-muted-foreground text-xs">
										{action.data.txid ? "Broadcast to the network." : "Ready to broadcast."}
									</span>
								</div>
							</div>
							<ResultField label="Signed PSET" value={action.data.pset} />
							{action.data.txid ? (
								<ResultField label="Transaction id" value={action.data.txid} />
							) : null}
						</div>
					) : (
						<div className="flex flex-col gap-5">
							<TextAreaField
								label="PSET (base64)"
								value={pset}
								onChange={setPset}
								placeholder="cHNldP8B..."
							/>
							<TextAreaField
								label="Sign inputs (JSON)"
								value={signInputs}
								onChange={setSignInputs}
								placeholder='[{ "address": "…", "index": 0, "sighashTypes": [1] }]'
								hint="Inputs to sign, e.g. [{ address, index, sighashTypes? }]."
							/>
							<div className="flex items-center gap-2">
								<Checkbox
									id={broadcastId}
									checked={broadcast}
									disabled={pending}
									onCheckedChange={(value) => setBroadcast(value === true)}
								/>
								<Label htmlFor={broadcastId}>Broadcast after signing</Label>
							</div>
							{action.status === "error" && action.error ? (
								<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs">
									{action.error}
								</p>
							) : null}
						</div>
					)}
				</div>

				<SheetFooter>
					{action.status === "success" ? (
						<Button onClick={() => handleOpenChange(false)}>Done</Button>
					) : (
						<Button disabled={!canSign || pending} onClick={sign}>
							{pending ? (
								<>
									<Loader2Icon className="animate-spin motion-reduce:animate-none" />
									Signing…
								</>
							) : (
								<>
									<PenLineIcon />
									Sign PSET
								</>
							)}
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
