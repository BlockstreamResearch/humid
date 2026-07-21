import {
	LIQUID_IDENTITY_CURVE,
	LIQUID_IDENTITY_SHARED_KEY_KDF,
} from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { DEFAULT_IDENTITY, DEFAULT_KDF_INFO } from "../../lib/constants";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function GetIdentitySharedKeyCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("getIdentitySharedKey");
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const [theirPublicKey, setTheirPublicKey] = useState("");
	const [kdfInfo, setKdfInfo] = useState(DEFAULT_KDF_INFO);
	const [kdfSalt, setKdfSalt] = useState("");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="SLIP-0017 shared key (ECDH → HKDF-SHA256) with a peer nist256p1 public key."
			policy={state}
			title="getIdentitySharedKey"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Identity URI" onChange={setIdentity} value={identity} />
				<TextField label="Index" onChange={setIndex} value={index} />
			</div>
			<TextField
				label="Their public key (uncompressed hex)"
				onChange={setTheirPublicKey}
				value={theirPublicKey}
			/>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="KDF info hex" onChange={setKdfInfo} value={kdfInfo} />
				<TextField label="KDF salt hex" onChange={setKdfSalt} value={kdfSalt} />
			</div>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.getIdentitySharedKey({
							curve: LIQUID_IDENTITY_CURVE,
							identity,
							index: Number(index),
							kdf: LIQUID_IDENTITY_SHARED_KEY_KDF,
							kdfInfo,
							kdfSalt,
							theirPublicKey,
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
