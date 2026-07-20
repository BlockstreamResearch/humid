import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { policyAssetIdForChain } from "../../lib/constants";
import { trimmedOrUndefined } from "../../lib/format";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function GetBalanceCard() {
	const { chainId, wallet } = useHumidContext();
	const state = useMethodState("getBalance");
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet-computed balance for the policy asset or a supplied ELIP-0144 asset id."
			policy={state}
			title="getBalance"
		>
			<TextField label="Asset id (optional)" onChange={setAssetId} value={assetId} />
			<CallButton
				disabled={pending}
				onClick={() => {
					const asset = trimmedOrUndefined(assetId);
					call(() => wallet.getBalance(asset ? { assetId: asset } : undefined));
				}}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
