import type { LiquidProcessConfidentialTransactionParams } from "@humid/appkit-injected-adapter";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { P2PK_SOURCE } from "../../contracts/p2pk";
import { parseJsonInput } from "../../lib/format";
import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { CheckboxField, SelectField, TextAreaField, TextField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

/**
 * The published p2pk protocol, which is the thinnest real one: no deployment values, and a
 * single kind of holding. `Pay` locks funds into it; `Receive` spends one back out, which is
 * the half that exercises the address check against the network.
 */
const ACTIONS = [
	{ label: "Pay — lock funds into a p2pk output", value: "Pay" },
	{ label: "Receive — spend a p2pk output back to your wallet", value: "Receive" },
];

export function ProcessCtCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("processConfidentialTransaction");
	const { call, pending, result } = useRpcCall();

	const [action, setAction] = useState("Pay");
	const [pubkey, setPubkey] = useState("");
	const [amount, setAmount] = useState("1000");
	const [broadcast, setBroadcast] = useState(false);
	const [stateFile, setStateFile] = useState("");

	const spending = action === "Receive";

	// The six parts of the request, assembled here rather than typed by hand. The wallet
	// rebuilds the contract from `contractSources` and checks it against the chain, so what
	// this card supplies is exactly what a real protocol's site would supply.
	const params = {
		action,
		broadcast,
		contractSources: { "./p2pk.simf": P2PK_SOURCE },
		manifest: p2pkManifest,
		params: spending ? { pubkey } : { amount_sat: Number(amount) || 0, pubkey },
		...(spending ? { state: parseJsonInput(stateFile) ?? {} } : {}),
	};

	return (
		<RpcCard
			description="Performs one action of a txManifest protocol. The wallet rebuilds every contract from the source supplied here and refuses unless the address it derives matches where the funds actually sit."
			policy={state}
			title="processConfidentialTransaction"
		>
			<SelectField label="Action" onChange={setAction} options={ACTIONS} value={action} />

			<TextField
				label="Recipient x-only public key (32 bytes, hex)"
				onChange={setPubkey}
				placeholder="79be667e…"
				value={pubkey}
			/>

			{spending ? (
				<TextAreaField
					label='State file — which covenant outputs exist: {"utxos":[{"utxo_type":"p2pk_output","txid":"…","vout":0}]}'
					onChange={setStateFile}
					value={stateFile}
				/>
			) : (
				<TextField label="Amount to lock (satoshis)" onChange={setAmount} value={amount} />
			)}

			<CheckboxField
				label="Broadcast — leave off to get the signed transaction back without sending it"
				onChange={setBroadcast}
				value={broadcast}
			/>

			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.processConfidentialTransaction(
							params as unknown as LiquidProcessConfidentialTransactionParams,
						),
					)
				}
			/>

			<ResultPanel result={result} />
		</RpcCard>
	);
}
