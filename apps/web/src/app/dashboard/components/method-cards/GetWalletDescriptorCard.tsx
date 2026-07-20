import type { LiquidDescriptorType } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { useMethodState } from "../../lib/method-state";
import { useRpcCall } from "../../lib/useRpcCall";
import { CallButton } from "../CallButton";
import { SelectField } from "../fields";
import { ResultPanel } from "../ResultPanel";
import { RpcCard } from "../RpcCard";

export function GetWalletDescriptorCard() {
	const { wallet } = useHumidContext();
	const state = useMethodState("getWalletDescriptor");
	const [descriptorType, setDescriptorType] = useState("publicWalletDescriptor");
	const [descriptorFormat, setDescriptorFormat] = useState("bip380-bip389-multipath");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Approved public wallet descriptor. Confidential descriptors return an extension-side error."
			policy={state}
			title="getWalletDescriptor"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<SelectField
					label="Descriptor type"
					onValueChange={setDescriptorType}
					options={["publicWalletDescriptor", "publicConfidentialDescriptor"]}
					value={descriptorType}
				/>
				<SelectField
					label="Descriptor format"
					onValueChange={setDescriptorFormat}
					options={[
						"bip380-bip389-multipath",
						"bip380-split-branches",
						"elip150-public-ct-bip389-multipath",
						"elip150-public-ct-split-branches",
					]}
					value={descriptorFormat}
				/>
			</div>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						wallet.getWalletDescriptor({
							descriptorFormat: [{ format: descriptorFormat }],
							descriptorType: descriptorType as LiquidDescriptorType,
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}
