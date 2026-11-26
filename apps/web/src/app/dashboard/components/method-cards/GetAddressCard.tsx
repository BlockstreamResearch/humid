import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { CheckboxField, TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function GetAddressCard({ onAddress }: { onAddress: (address: string) => void }) {
	const { wallet } = useHumidContext();
	const state = useMethodState("getAddress");
	const [index, setIndex] = useState("0");
	const [confidential, setConfidential] = useState(true);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="The account's receive address at an index. Feeds the address into signMessage."
			policy={state}
			title="getAddress"
		>
			<TextField label="Address index" onChange={setIndex} value={index} />
			<CheckboxField checked={confidential} label="Confidential" onChange={setConfidential} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(async () => {
						const res = await wallet.getAddress({ confidential, index: Number(index) });

						onAddress(res.address);

						return res;
					})
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
