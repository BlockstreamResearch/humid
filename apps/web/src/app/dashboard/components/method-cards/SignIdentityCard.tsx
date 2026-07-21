import { LIQUID_IDENTITY_CURVE } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { DEFAULT_IDENTITY, DEFAULT_IDENTITY_CHALLENGE } from "../../lib/constants";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { TextAreaField, TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function SignIdentityCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("signIdentity");
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const [challenge, setChallenge] = useState(DEFAULT_IDENTITY_CHALLENGE);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Signs a hex identity challenge with the SLIP-0013 identity key."
			policy={state}
			title="signIdentity"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Identity URI" onChange={setIdentity} value={identity} />
				<TextField label="Index" onChange={setIndex} value={index} />
			</div>
			<TextAreaField label="Challenge hex" onChange={setChallenge} value={challenge} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.signIdentity({
							challenge,
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
