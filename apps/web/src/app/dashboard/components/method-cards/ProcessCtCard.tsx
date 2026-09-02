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
const ACTIONS = ["Pay", "Receive"];

/**
 * An x-only public key, which is what the p2pk contract's PUB_KEY parameter is.
 *
 * Checked here rather than left to the wallet because the mistake this catches is the
 * obvious one — pasting an address, which is the other thing the wallet shows you — and
 * a request that leaves this page is answered by the contract compiler complaining about
 * a character position.
 */
const X_ONLY_KEY = /^(?:0x)?[0-9a-fA-F]{64}$/;

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
	const keyProblem = X_ONLY_KEY.test(pubkey.trim())
		? undefined
		: pubkey.trim() === ""
			? "Needed: 32 bytes as 64 hexadecimal characters."
			: pubkey.trim().startsWith("tlq1") ||
				  pubkey.trim().startsWith("tex1") ||
				  pubkey.trim().startsWith("lq1") ||
				  pubkey.trim().startsWith("ex1")
				? "That is an address, not a key. Receive → Unconfidential shows both — this field wants the second one."
				: `Not an x-only public key: ${pubkey.trim().length} characters, and 64 hexadecimal ones are needed.`;

	// The six parts of the request, assembled here rather than typed by hand. The wallet
	// rebuilds the contract from `contractSources` and checks it against the chain, so what
	// this card supplies is exactly what a real protocol's site would supply.
	const params = {
		action,
		broadcast,
		contractSources: { "./p2pk.simf": P2PK_SOURCE },
		manifest: p2pkManifest,
		params: spending
			? { pubkey: pubkey.trim() }
			: { amount_sat: Number(amount) || 0, pubkey: pubkey.trim() },
		...(spending ? { state: parseJsonInput(stateFile) ?? {} } : {}),
	};

	return (
		<RpcCard
			description="Performs one action of a txManifest protocol. The wallet rebuilds every contract from the source supplied here and refuses unless the address it derives matches where the funds actually sit."
			policy={state}
			title="processConfidentialTransaction"
		>
			<SelectField
				label={
					spending
						? "Action — Receive spends a p2pk output back to your wallet"
						: "Action — Pay locks funds into a p2pk output"
				}
				onValueChange={setAction}
				options={ACTIONS}
				value={action}
			/>

			{/* One key signs every contract action, and it is not the one the wallet's ordinary
			    receive screen shows. To spend what Pay locks, this must be the wallet's own
			    contract key — HUMID → Receive → Unconfidential. */}
			<TextField
				label="Recipient x-only public key — for a spendable output, the wallet's own contract key"
				onChange={setPubkey}
				placeholder="79be667e…"
				value={pubkey}
			/>

			{keyProblem === undefined ? null : (
				<p className="text-xs text-amber-600 dark:text-amber-500">{keyProblem}</p>
			)}

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
				checked={broadcast}
				label="Broadcast — leave off to get the signed transaction back without sending it"
				onChange={setBroadcast}
			/>

			<CallButton
				disabled={pending || keyProblem !== undefined}
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
