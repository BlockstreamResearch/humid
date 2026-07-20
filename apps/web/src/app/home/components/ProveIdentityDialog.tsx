import {
	LIQUID_IDENTITY_CURVE,
	type LiquidSignIdentityResult,
} from "@humid/appkit-injected-adapter";
import { FingerprintIcon, Loader2Icon } from "lucide-react";
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
import { DEFAULT_IDENTITY_CHALLENGE, DEFAULT_IDENTITY_URI } from "@/lib/liquid";

import { ResultField, TextAreaField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Prove ownership of the SLIP-0013 identity by signing a hex challenge. */
export function ProveIdentityDialog({ open, onOpenChange }: OverlayProps) {
	const { wallet } = useHumidContext();
	const [challenge, setChallenge] = useState(DEFAULT_IDENTITY_CHALLENGE);
	const action = useAsyncAction<LiquidSignIdentityResult>();

	const canProve = challenge.trim().length > 0;
	const pending = action.status === "pending";

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		if (!next) {
			window.setTimeout(() => {
				setChallenge(DEFAULT_IDENTITY_CHALLENGE);
				action.reset();
			}, 250);
		}
	};

	const prove = async () => {
		const result = await action.run(() =>
			wallet.signIdentity({
				challenge: challenge.trim(),
				curve: LIQUID_IDENTITY_CURVE,
				identity: DEFAULT_IDENTITY_URI,
			}),
		);
		if (result.ok) toast.success("Identity proven");
		else toast.error("Proof failed", { description: result.error });
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Prove identity</DialogTitle>
					<DialogDescription>
						Signs a challenge with the identity key for{" "}
						<code className="text-xs">{DEFAULT_IDENTITY_URI}</code>.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<TextAreaField
						label="Challenge (hex)"
						value={challenge}
						onChange={setChallenge}
						placeholder="Hex challenge"
					/>
					{action.status === "success" && action.data ? (
						<div className="flex flex-col gap-3">
							<ResultField label="Signature" value={action.data.signature} />
							<ResultField label="Public key" value={action.data.publicKey} />
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button disabled={!canProve || pending} onClick={prove}>
						{pending ? (
							<>
								<Loader2Icon className="animate-spin motion-reduce:animate-none" />
								Proving…
							</>
						) : (
							<>
								<FingerprintIcon />
								Prove identity
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
