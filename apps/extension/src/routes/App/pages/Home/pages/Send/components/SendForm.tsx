import type { FormEvent } from "react";

import { Page } from "@/common/Page";
import { formatUnits } from "@/helpers/formatters";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";
import { UiTextarea } from "@/ui/UiTextarea/base";

import type { SendableAsset } from "../model";
import { AssetSelector } from "./AssetSelector";

type SendFormProps = {
	amount: string;
	assets: SendableAsset[];
	canContinue: boolean;
	error: string | null;
	isEstimatingMax: boolean;
	isPreparing: boolean;
	maxDisabled: boolean;
	onAmountChange: (value: string) => void;
	onContinue: () => void;
	onMax: () => void;
	onRecipientChange: (value: string) => void;
	onSelectAsset: (rawAssetId: string) => void;
	recipient: string;
	selectedAsset: SendableAsset | null;
};

export function SendForm({
	amount,
	assets,
	canContinue,
	error,
	isEstimatingMax,
	isPreparing,
	maxDisabled,
	onAmountChange,
	onContinue,
	onMax,
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
		<Page back={{ label: "Back", to: "/app" }} title="Send">
			{assets.length === 0 ? (
				<p className="text-muted-foreground px-6 py-10 text-center text-sm">
					No assets available to send yet. The balance may still be syncing — reopen this screen
					once the balance appears on the home page.
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
						<UiTextarea
							autoComplete="off"
							className="min-h-0 resize-none font-mono break-all"
							id="send-recipient"
							onChange={(event) => onRecipientChange(event.target.value.replace(/\s/g, ""))}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;

								event.preventDefault();
								event.currentTarget.form?.requestSubmit();
							}}
							placeholder="Liquid address"
							rows={1}
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
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-xs">
										Balance: {formatUnits(selectedAsset.amount, selectedAsset.decimals)}{" "}
										{selectedAsset.symbol}
									</span>
									<button
										className="text-primary text-xs font-semibold uppercase transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
										disabled={maxDisabled}
										onClick={onMax}
										type="button"
									>
										{isEstimatingMax ? "Max…" : "Max"}
									</button>
								</div>
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
		</Page>
	);
}
