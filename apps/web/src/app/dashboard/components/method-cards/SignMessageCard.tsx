import type { LiquidSignMessageProtocol } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { SelectField, TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function SignMessageCard({ knownAddress }: { knownAddress: string }) {
	const { wallet } = useHumidContext();
	const state = useMethodState("signMessage");
	const [address, setAddress] = useState("");
	const [message, setMessage] = useState("Authorize HUMID test dapp");
	const [protocol, setProtocol] = useState("ecdsa");
	const { call, pending, result } = useRpcCall();
	const effectiveAddress = address || knownAddress;

	return (
		<RpcCard
			description="Signs with the spend key for a wallet-owned address. Use an address from getUTXOs."
			policy={state}
			title="signMessage"
		>
			<TextField
				label="Wallet-owned address"
				onChange={setAddress}
				placeholder={knownAddress || "run getUTXOs first"}
				value={effectiveAddress}
			/>
			<TextField label="Message" onChange={setMessage} value={message} />
			<SelectField
				label="Protocol"
				onValueChange={setProtocol}
				options={["ecdsa", "bip322"]}
				value={protocol}
			/>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.signMessage({
							address: effectiveAddress,
							message,
							protocol: protocol as LiquidSignMessageProtocol,
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
