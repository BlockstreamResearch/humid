import type { LiquidProcessConfidentialTransactionParams } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { parseJsonInput } from "../../lib/format";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { TextAreaField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function ProcessCtCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("processConfidentialTransaction");
	const [payload, setPayload] = useState("{}");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet ABI method. The extension returns a structured not_implemented error."
			policy={state}
			title="processConfidentialTransaction"
		>
			<TextAreaField label="Wallet ABI request JSON" onChange={setPayload} value={payload} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.processConfidentialTransaction(
							(parseJsonInput(payload) ?? {}) as LiquidProcessConfidentialTransactionParams,
						),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
