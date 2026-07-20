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

export function GetUtxosCard({ onAddress }: { onAddress: (address: string) => void }) {
	const { chainId, wallet } = useHumidContext();
	const state = useMethodState("getUTXOs");
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet UTXOs with safe txOut data. Feeds the first address into signMessage."
			policy={state}
			title="getUTXOs"
		>
			<TextField label="Asset id (optional)" onChange={setAssetId} value={assetId} />
			<CallButton
				disabled={pending}
				onClick={() => {
					const asset = trimmedOrUndefined(assetId);
					call(async () => {
						const res = await wallet.getUTXOs(asset ? { assetId: asset } : undefined);
						const first = res.utxos[0]?.address;
						if (first) onAddress(first);
						return res;
					});
				}}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
