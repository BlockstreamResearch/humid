import { useMemo, useState } from "react";

import type { SendTransferInput } from "@/core/accounts/application/accounts-rpc/model/types";
import { usePendingTransfers } from "@/core/accounts/application/pending-transfers/usePendingTransfers";
import { parseUnits } from "@/helpers/formatters";
import { chainGroupUis } from "@/routes/App/chainGroupUis";

import { useHome } from "../../HomeContext";
import { SendForm } from "./components/SendForm";
import { SendResult } from "./components/SendResult";
import { SendReview } from "./components/SendReview";
import { type SendableAsset, toSendableAssets } from "./model";
import { Route } from "./route";
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
