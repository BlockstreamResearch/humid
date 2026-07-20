import type { LiquidSendTransferParams } from "@humid/appkit-injected-adapter";
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

export function SendTransferCard() {
	const { chainId, wallet } = useHumidContext();
	const state = useMethodState("sendTransfer");
	const [recipientAddress, setRecipientAddress] = useState("");
	const [amount, setAmount] = useState("1000");
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const [memo, setMemo] = useState("");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet-built transfer. Prompts for confirmation on every call unless humid_methodPolicy marks it silent; decline → 4001."
			policy={state}
			title="sendTransfer"
		>
			<TextField
				label="Recipient address"
				onChange={setRecipientAddress}
				value={recipientAddress}
			/>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Amount (base units)" onChange={setAmount} value={amount} />
				<TextField label="Asset id (optional)" onChange={setAssetId} value={assetId} />
			</div>
			<TextField label="Memo hex (optional, ≤80 bytes)" onChange={setMemo} value={memo} />
			<CallButton
				disabled={pending}
				onClick={() => {
					const params: LiquidSendTransferParams = {
						amount: amount.trim(),
						recipientAddress: recipientAddress.trim(),
					};
					const asset = trimmedOrUndefined(assetId);
					if (asset) params.assetId = asset;
					const memoHex = trimmedOrUndefined(memo);
					if (memoHex) params.memo = memoHex;
					call(() => wallet.sendTransfer(params));
				}}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
