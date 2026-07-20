import { LIQUID_IDENTITY_CURVE } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { DEFAULT_IDENTITY } from "../../lib/constants";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function GetIdentityPublicKeyCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("getIdentityPublicKey");
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Deterministic SLIP-0013 identity public key (nist256p1)."
			policy={state}
			title="getIdentityPublicKey"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Identity URI" onChange={setIdentity} value={identity} />
				<TextField label="Index" onChange={setIndex} value={index} />
			</div>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.getIdentityPublicKey({
							curve: LIQUID_IDENTITY_CURVE,
							identity,
							index: Number(index),
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
