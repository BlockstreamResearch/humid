import {
	LIQUID_IDENTITY_CURVE,
	LIQUID_IDENTITY_SHARED_KEY_KDF,
	type LiquidGetIdentitySharedKeyResult,
} from "@humid/appkit-injected-adapter";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
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
import { DEFAULT_IDENTITY_URI, DEFAULT_KDF_INFO } from "@/lib/liquid";

import { ResultField, TextField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Derive a SLIP-0017 shared secret (ECDH → HKDF-SHA256) against a peer's public key. */
export function DeriveSharedSecretDialog({ open, onOpenChange }: OverlayProps) {
	const { wallet } = useHumidContext();
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY_URI);
	const [index, setIndex] = useState("0");
	const [theirPublicKey, setTheirPublicKey] = useState("");
	const [kdfInfo, setKdfInfo] = useState(DEFAULT_KDF_INFO);
	const [kdfSalt, setKdfSalt] = useState("");
	const action = useAsyncAction<LiquidGetIdentitySharedKeyResult>();

	const canDerive = identity.trim().length > 0 && theirPublicKey.trim().length > 0;
	const pending = action.status === "pending";

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		if (!next) {
			window.setTimeout(() => {
				setIdentity(DEFAULT_IDENTITY_URI);
				setIndex("0");
				setTheirPublicKey("");
				setKdfInfo(DEFAULT_KDF_INFO);
				setKdfSalt("");
				action.reset();
			}, 250);
		}
	};

	const derive = async () => {
		const result = await action.run(() =>
			wallet.getIdentitySharedKey({
				curve: LIQUID_IDENTITY_CURVE,
				identity: identity.trim(),
				index: Number(index),
				kdf: LIQUID_IDENTITY_SHARED_KEY_KDF,
				kdfInfo: kdfInfo.trim(),
				kdfSalt: kdfSalt.trim(),
				theirPublicKey: theirPublicKey.trim(),
			}),
		);
		if (result.ok) toast.success("Shared secret derived");
		else toast.error("Derivation failed", { description: result.error });
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Derive shared secret</DialogTitle>
					<DialogDescription>
						SLIP-0017 ECDH → HKDF-SHA256 with a peer&apos;s nist256p1 public key.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField label="Identity URI" value={identity} onChange={setIdentity} />
						<TextField label="Index" mono={false} value={index} onChange={setIndex} />
					</div>
					<TextField
						label="Their public key (uncompressed hex)"
						value={theirPublicKey}
						onChange={setTheirPublicKey}
						placeholder="04…"
					/>
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField label="KDF info (hex)" value={kdfInfo} onChange={setKdfInfo} />
						<TextField
							label="KDF salt (hex)"
							value={kdfSalt}
							onChange={setKdfSalt}
							placeholder="Optional"
						/>
					</div>
					{action.status === "success" && action.data ? (
						<div className="flex flex-col gap-3">
							<ResultField label="Shared key" value={action.data.sharedKey} />
							<ResultField label="Public key" value={action.data.publicKey} />
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button disabled={!canDerive || pending} onClick={derive}>
						{pending ? (
							<>
								<Loader2Icon className="animate-spin motion-reduce:animate-none" />
								Deriving…
							</>
						) : (
							<>
								<KeyRoundIcon />
								Derive secret
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
