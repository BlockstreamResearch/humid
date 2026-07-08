import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";

import { formatUnits } from "@/helpers/formatters";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

import type { SendableAsset } from "../model";
import { AssetSelector } from "./AssetSelector";

type SendFormProps = {
	amount: string;
	assets: SendableAsset[];
	canContinue: boolean;
	error: string | null;
	isPreparing: boolean;
	onAmountChange: (value: string) => void;
	onContinue: () => void;
	onRecipientChange: (value: string) => void;
	onSelectAsset: (rawAssetId: string) => void;
	recipient: string;
	selectedAsset: SendableAsset | null;
};

/**
 * Step 1 of the Send flow: recipient, amount (human units), and asset. Validation state (non-empty
 * recipient + positive, representable amount) is computed by the container and passed as `canContinue`;
 * this view only collects input and hands "Continue" back up to trigger the preview.
 */
export function SendForm({
	amount,
	assets,
	canContinue,
	error,
	isPreparing,
	onAmountChange,
	onContinue,
	onRecipientChange,
	onSelectAsset,
	recipient,
	selectedAsset,
}: SendFormProps) {
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();

		if (canContinue) onContinue();
	};

	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-2.5">
				<Link
					to="/app"
					aria-label="Back"
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<p className="text-sm font-semibold">Send</p>
			</header>

			<UiScrollArea className="min-h-0 flex-1">
				{assets.length === 0 ? (
					<p className="text-muted-foreground px-6 py-10 text-center text-sm">
						No assets available to send yet. Your balance may still be syncing — reopen this screen
						once it appears on the home page.
					</p>
				) : (
					<form className="flex flex-col gap-4 px-5 py-4" onSubmit={handleSubmit}>
						<div className="flex flex-col gap-1.5">
							<span className="text-sm font-medium">Asset</span>
							<AssetSelector assets={assets} onSelect={onSelectAsset} selected={selectedAsset} />
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="send-recipient">
								Recipient address
							</label>
							<UiInput
								autoComplete="off"
								className="font-mono"
								id="send-recipient"
								onChange={(event) => onRecipientChange(event.target.value)}
								placeholder="Liquid address (lq1… / VJL…)"
								spellCheck={false}
								value={recipient}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between gap-2">
								<label className="text-sm font-medium" htmlFor="send-amount">
									Amount
								</label>
								{selectedAsset ? (
									<span className="text-muted-foreground text-xs">
										Balance: {formatUnits(selectedAsset.amount, selectedAsset.decimals)}{" "}
										{selectedAsset.symbol}
									</span>
								) : null}
							</div>
							<div className="relative">
								<UiInput
									autoComplete="off"
									className="pr-16"
									id="send-amount"
									inputMode="decimal"
									onChange={(event) => onAmountChange(event.target.value)}
									placeholder="0.0"
									value={amount}
								/>
								{selectedAsset ? (
									<span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
										{selectedAsset.symbol}
									</span>
								) : null}
							</div>
						</div>

						{error ? <p className="text-destructive text-sm break-words">{error}</p> : null}

						<UiButton disabled={!canContinue} size="lg" type="submit">
							{isPreparing ? "Checking…" : "Continue"}
						</UiButton>
					</form>
				)}
			</UiScrollArea>
		</div>
	);
}
