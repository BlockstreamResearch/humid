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
	const { accountGroup, chain, portfolio } = useHome();
	const assets = useMemo(() => toSendableAssets(portfolio.tokens), [portfolio.tokens]);

	// Optimistic pending tracking is keyed by the selected account + chain — the same axes the asset
	// screen's activity feed reads. The native asset's raw id backs the fallback below when a send
	// omits `rawAssetId` (native L-BTC): it's the sole `isNative` row, flattened from the portfolio.
	const pending = usePendingTransfers(accountGroup.id, chain.id);
	const nativeRawAssetId = assets.find((asset) => asset.isNative)?.rawAssetId ?? null;

	// Deep-link from an asset's detail page: pre-select that asset if it's one we can send;
	// an unknown/absent id keeps null, which falls back to the native asset below.
	const { asset: initialRawAssetId } = Route.useSearch();

	const [step, setStep] = useState<Step>("form");
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [selectedRawAssetId, setSelectedRawAssetId] = useState<string | null>(() =>
		initialRawAssetId && assets.some((asset) => asset.rawAssetId === initialRawAssetId)
			? initialRawAssetId
			: null,
	);
	// True only while the current amount came from a native L-BTC "Max" (a drain estimate) and hasn't
	// been touched since — it flags the send as `sendAll` so the broadcast drains (fee-drift immune).
	// Any manual amount edit or asset switch clears it (the amount is no longer "the whole balance").
	const [nativeSendAll, setNativeSendAll] = useState(false);
	const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);

	const inspect = useInspectTransfer();
	const estimateMax = useEstimateMaxSend();
	const send = useSendTransfer();

	// Default to the native asset (sorted first); the picker overrides via `selectedRawAssetId`.
	const selectedAsset =
		assets.find((asset) => asset.rawAssetId === selectedRawAssetId) ?? assets[0] ?? null;

	// Parse the human amount to a base-unit string at the input boundary; null = not yet valid.
	const baseAmount = selectedAsset ? parseUnits(amount, selectedAsset.decimals) : null;
	const amountValid = baseAmount !== null && BigInt(baseAmount) > 0n;
	const canContinue = recipient.trim().length > 0 && amountValid && !inspect.isPending;

	// The native drain estimate builds a real PSET against the recipient, so it needs a non-empty one
	// first. Issued-asset Max is pure UI (the full balance), so it's always available.
	const maxDisabled =
		!selectedAsset ||
		estimateMax.isPending ||
		(selectedAsset.isNative && recipient.trim().length === 0);

	// A manual amount edit means the amount is no longer the drained whole-balance — drop `sendAll`.
	const handleAmountChange = (value: string) => {
		setAmount(value);
		setNativeSendAll(false);
	};

	// Switching asset invalidates any pending native Max (a different asset has a different max).
	const handleSelectAsset = (rawAssetId: string) => {
		setSelectedRawAssetId(rawAssetId);
		setNativeSendAll(false);
	};

	const handleMax = () => {
		if (!selectedAsset) return;

		if (!selectedAsset.isNative) {
			// Issued asset: the fee is paid separately in L-BTC, so Max is just the full balance.
			setAmount(formatUnits(selectedAsset.amount, selectedAsset.decimals));
			setNativeSendAll(false);

			return;
		}

		const recipientAddress = recipient.trim();

		if (!recipientAddress) return;

		// Native L-BTC: ask the backend to drain (it syncs + computes the fee) and fill the returned
		// max, recording that this amount is a `sendAll` drain so the send broadcasts a fresh drain.
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
			// Only a native L-BTC Max that still owns the amount drains; anything else sends the amount.
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
				// Record the broadcast so it shows as "Pending" atop this asset's activity immediately,
				// before the next scan. Native L-BTC sends omit `rawAssetId`, so fall back to the native id.
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
