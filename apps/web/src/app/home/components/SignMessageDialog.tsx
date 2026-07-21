import type { LiquidSignMessageResult } from "@humid/appkit-injected-adapter";
import { Loader2Icon, PenLineIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { ResultField, TextAreaField, TextField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Sign an arbitrary message with the spend key of a wallet-owned address. */
export function SignMessageDialog({ open, onOpenChange }: OverlayProps) {
	const { address, wallet } = useHumidContext();
	const [message, setMessage] = useState("");
	const [signer, setSigner] = useState("");
	const action = useAsyncAction<LiquidSignMessageResult>();

	const effectiveAddress = signer.trim() || address;
	const canSign = message.trim().length > 0 && effectiveAddress.length > 0;
	const pending = action.status === "pending";

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		if (!next) {
			window.setTimeout(() => {
				setMessage("");
				setSigner("");
				action.reset();
			}, 250);
		}
	};

	const sign = async () => {
		const result = await action.run(() =>
			wallet.signMessage({ address: effectiveAddress, message }),
		);
		if (result.ok) toast.success("Message signed");
		else toast.error("Signing failed", { description: result.error });
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Sign message</DialogTitle>
					<DialogDescription>Signs with the spend key of a wallet-owned address.</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<TextAreaField
						label="Message"
						value={message}
						onChange={setMessage}
						placeholder="Message to sign"
					/>
					<TextField
						label="Signing address"
						value={signer}
						onChange={setSigner}
						placeholder={address || "Wallet-owned address"}
						hint="Defaults to the connected address."
					/>
					{action.status === "success" && action.data ? (
						<ResultField label="Signature" value={action.data.signature} />
					) : null}
				</div>

				<DialogFooter>
					<Button disabled={!canSign || pending} onClick={sign}>
						{pending ? (
							<>
								<Loader2Icon className="animate-spin motion-reduce:animate-none" />
								Signing…
							</>
						) : (
							<>
								<PenLineIcon />
								Sign message
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
