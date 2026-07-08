import { useMemo, useState } from "react";

import type { SendTransferInput } from "@/core/accounts/application/accounts-rpc/model/types";
import { parseUnits } from "@/helpers/formatters";
import { chainGroupUis } from "@/routes/App/chainGroupUis";

import { useHome } from "../../HomeContext";
import { SendForm } from "./components/SendForm";
import { SendResult } from "./components/SendResult";
import { SendReview } from "./components/SendReview";
import { type SendableAsset, toSendableAssets } from "./model";
import { useInspectTransfer, useSendTransfer } from "./useSendTransfer";

type Step = "form" | "review" | "result";

/** The exact RPC input plus the display info the later steps show (human amount + asset). */
type PreparedTransfer = {
	amountLabel: string;
	asset: SendableAsset;
	input: SendTransferInput;
};

/**
 * Send tab: a 3-step flow (form → review → result) for sending from the selected account on the
 * selected chain. Amounts stay raw base-unit strings across the RPC — the form parses the human
 * amount into base units here, and each step formats base units back to human units for display.
 * The popup's review screen IS the confirmation, so the RPCs bypass the dapp confirm round-trip.
 */
export function SendPage() {
	const { chain, portfolio } = useHome();
	const assets = useMemo(() => toSendableAssets(portfolio.tokens), [portfolio.tokens]);

	const [step, setStep] = useState<Step>("form");
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [selectedRawAssetId, setSelectedRawAssetId] = useState<string | null>(null);
	const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);

	const inspect = useInspectTransfer();
	const send = useSendTransfer();

	// Default to the native asset (sorted first); the picker overrides via `selectedRawAssetId`.
	const selectedAsset =
		assets.find((asset) => asset.rawAssetId === selectedRawAssetId) ?? assets[0] ?? null;

	// Parse the human amount to a base-unit string at the input boundary; null = not yet valid.
	const baseAmount = selectedAsset ? parseUnits(amount, selectedAsset.decimals) : null;
	const amountValid = baseAmount !== null && BigInt(baseAmount) > 0n;
	const canContinue = recipient.trim().length > 0 && amountValid && !inspect.isPending;

	const handleContinue = () => {
		if (!selectedAsset || baseAmount === null || !amountValid) return;

		const input: SendTransferInput = {
			amount: baseAmount,
			rawAssetId: selectedAsset.rawAssetId,
			recipientAddress: recipient.trim(),
		};

		setPrepared({ amountLabel: amount.trim(), asset: selectedAsset, input });
		inspect.mutate(input, { onSuccess: () => setStep("review") });
	};

	const handleBack = () => {
		inspect.reset();
		send.reset();
		setStep("form");
	};

	const handleConfirm = () => {
		if (!prepared) return;

		send.mutate(prepared.input, { onSuccess: () => setStep("result") });
	};

	if (step === "review" && prepared && inspect.data) {
		return (
			<SendReview
				amountLabel={prepared.amountLabel}
				error={send.error?.message ?? null}
				isSending={send.isPending}
				onBack={handleBack}
				onConfirm={handleConfirm}
				recipientAddress={inspect.data.recipientAddress}
				recipientConfidential={inspect.data.recipientConfidential}
				symbol={prepared.asset.symbol}
			/>
		);
	}

	if (step === "result" && send.data) {
		return (
			<SendResult
				explorerUrl={
					chainGroupUis[chain.chainGroupId]?.explorerTxUrl(chain, send.data.txid) ?? null
				}
				txid={send.data.txid}
			/>
		);
	}

	return (
		<SendForm
			amount={amount}
			assets={assets}
			canContinue={canContinue}
			error={inspect.error?.message ?? null}
			isPreparing={inspect.isPending}
			onAmountChange={setAmount}
			onContinue={handleContinue}
			onRecipientChange={setRecipient}
			onSelectAsset={setSelectedRawAssetId}
			recipient={recipient}
			selectedAsset={selectedAsset}
		/>
	);
}
