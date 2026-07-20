import type { LiquidSignPsetInput } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { parseJsonInput } from "../../lib/format";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { CheckboxField, TextAreaField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function SignPsetCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("signPset");
	const [pset, setPset] = useState("");
	const [signInputs, setSignInputs] = useState('[{"index":0,"address":"","sighashTypes":[1]}]');
	const [broadcast, setBroadcast] = useState(false);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Signs the listed PSET inputs. Over-signing is rejected. Prompts for confirmation unless marked silent; decline → 4001."
			policy={state}
			title="signPset"
		>
			<TextAreaField
				label="PSET base64"
				onChange={setPset}
				placeholder="cHNldP8B..."
				value={pset}
			/>
			<TextAreaField label="signInputs JSON" onChange={setSignInputs} value={signInputs} />
			<CheckboxField checked={broadcast} label="Broadcast after signing" onChange={setBroadcast} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.signPset({
							broadcast,
							pset: pset.trim(),
							signInputs: parseJsonInput(signInputs) as LiquidSignPsetInput[],
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
