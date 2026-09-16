import { useMemo, useState } from "react";

import type { SendTransferInput } from "@/core/accounts/application/accounts-rpc/model/types";
import { usePendingTransfers } from "@/core/accounts/application/pending-transfers/usePendingTransfers";
import { formatUnits, parseUnits } from "@/helpers/formatters";
import { chainGroupUis } from "@/routes/App/chainGroupUis";

import { useHome } from "../../HomeContext";
import { SendForm } from "./components/SendForm";
import { SendResult } from "./components/SendResult";
import { SendReview } from "./components/SendReview";
import { type SendableAsset, toSendableAssets } from "./model";
import { Route } from "./route";
import { useEstimateMaxSend, useInspectTransfer, useSendTransfer } from "./useSendTransfer";

type Step = "form" | "review" | "result";

type PreparedTransfer = {
	amountLabel: string;
	asset: SendableAsset;
	input: SendTransferInput;
};

export function SendPage() {
	const { accountGroup, chain, portfolio } = useHome();
	const assets = useMemo(() => toSendableAssets(portfolio.tokens), [portfolio.tokens]);

	const pending = usePendingTransfers(accountGroup.id, chain.id);
	const nativeRawAssetId = assets.find((asset) => asset.isNative)?.rawAssetId ?? null;

	const { asset: initialRawAssetId } = Route.useSearch();

	const [step, setStep] = useState<Step>("form");
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [selectedRawAssetId, setSelectedRawAssetId] = useState<string | null>(() =>
		initialRawAssetId && assets.some((asset) => asset.rawAssetId === initialRawAssetId)
			? initialRawAssetId
			: null,
	);
	const [nativeSendAll, setNativeSendAll] = useState(false);
	const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);

	const inspect = useInspectTransfer();
	const estimateMax = useEstimateMaxSend();
	const send = useSendTransfer();

	const selectedAsset =
		assets.find((asset) => asset.rawAssetId === selectedRawAssetId) ?? assets[0] ?? null;

	const baseAmount = selectedAsset ? parseUnits(amount, selectedAsset.decimals) : null;
	const amountValid = baseAmount !== null && BigInt(baseAmount) > 0n;
	const canContinue = recipient.trim().length > 0 && amountValid && !inspect.isPending;

	const maxDisabled =
		!selectedAsset ||
		estimateMax.isPending ||
		(selectedAsset.isNative && recipient.trim().length === 0);

	const handleAmountChange = (value: string) => {
		setAmount(value);
		setNativeSendAll(false);
	};

	const handleSelectAsset = (rawAssetId: string) => {
		setSelectedRawAssetId(rawAssetId);
		setNativeSendAll(false);
	};

	const handleMax = () => {
		if (!selectedAsset) return;

		if (!selectedAsset.isNative) {
			setAmount(formatUnits(selectedAsset.amount, selectedAsset.decimals));
			setNativeSendAll(false);

			return;
		}

		const recipientAddress = recipient.trim();

		if (!recipientAddress) return;

		estimateMax.mutate(
			{ rawAssetId: selectedAsset.rawAssetId, recipientAddress },
			{
				onSuccess: (result) => {
					setAmount(formatUnits(result.maxAmount, selectedAsset.decimals));
					setNativeSendAll(true);
				},
			},
		);
	};

	const handleContinue = () => {
		if (!selectedAsset || baseAmount === null || !amountValid) return;

		const input: SendTransferInput = {
			amount: baseAmount,
			rawAssetId: selectedAsset.rawAssetId,
			recipientAddress: recipient.trim(),
			...(nativeSendAll && selectedAsset.isNative ? { sendAll: true } : {}),
		};

		setPrepared({ amountLabel: amount.trim(), asset: selectedAsset, input });
		inspect.mutate(input, { onSuccess: () => setStep("review") });
	};

	const handleBack = () => {
		inspect.reset();
		estimateMax.reset();
		send.reset();
		setStep("form");
	};

	const handleConfirm = () => {
		if (!prepared) return;

		const { amount: amountSats, rawAssetId } = prepared.input;

		send.mutate(prepared.input, {
			onSuccess: (result) => {
				const assetId = rawAssetId ?? nativeRawAssetId;

				if (assetId) {
					pending.add({
						amountSats,
						createdAt: Date.now(),
						rawAssetId: assetId,
						txid: result.txid,
					});
				}

				setStep("result");
			},
		});
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
			error={inspect.error?.message ?? estimateMax.error?.message ?? null}
			isEstimatingMax={estimateMax.isPending}
			isPreparing={inspect.isPending}
			maxDisabled={maxDisabled}
			onAmountChange={handleAmountChange}
			onContinue={handleContinue}
			onMax={handleMax}
			onRecipientChange={setRecipient}
			onSelectAsset={handleSelectAsset}
			recipient={recipient}
			selectedAsset={selectedAsset}
		/>
	);
}
