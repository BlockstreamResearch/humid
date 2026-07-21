import type { LiquidGetUTXOsResult, LiquidSignPsetResult } from "@humid/appkit-injected-adapter";
import { CheckCircle2Icon, CoinsIcon, Loader2Icon, MergeIcon, SplitIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";
import { formatLbtc, truncateMiddle } from "@/lib/liquid";
import { buildCoinControlPset, rawAssetId, splitAmounts } from "@/lib/pset";

import { ResultField, ReviewRow, TextField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };
type Utxo = LiquidGetUTXOsResult["utxos"][number];
type Mode = "merge" | "split";
type Plan =
	| { ok: false; error: string }
	| { ok: true; feeSats: bigint; outputAmounts: bigint[]; total: bigint };

const DEFAULT_FEE = "1000";

const utxoKey = (utxo: Utxo) => `${utxo.txid}:${utxo.vout}`;

/**
 * Coin control: merge several coins into one, or split one coin into several — each a real end-to-end
 * exercise of signPset. The dapp builds the unblinded PSET (`lib/pset.ts`); the wallet blinds, signs
 * and broadcasts it. Both flows spend back to the wallet's own address (address reuse is fine here).
 */
export function ManageCoinsSheet({ open, onOpenChange }: OverlayProps) {
	const { chainId, supportedChains, wallet } = useHumidContext();
	const ticker =
		supportedChains.find((chain) => chain.caipNetworkId === chainId)?.nativeCurrency.symbol ??
		"L-BTC";

	const [mode, setMode] = useState<Mode>("merge");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [parts, setParts] = useState("2");
	const [fee, setFee] = useState(DEFAULT_FEE);

	const load = useAsyncAction<LiquidGetUTXOsResult>();
	const submit = useAsyncAction<LiquidSignPsetResult>();
	const loading = load.status === "pending";
	const signing = submit.status === "pending";

	const reset = () => {
		setMode("merge");
		setSelected(new Set());
		setParts("2");
		setFee(DEFAULT_FEE);
		load.reset();
		submit.reset();
	};

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		if (!next) window.setTimeout(reset, 250);
	};

	const fetchCoins = async () => {
		const result = await load.run(() => wallet.getUTXOs());
		if (!result.ok) toast.error("Couldn't load coins", { description: result.error });
	};

	// Fetch once when the sheet opens.
	useEffect(() => {
		if (open && load.status === "idle") void fetchCoins();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const loaded = load.status === "success" ? load.data : undefined;
	const policyAssetId = loaded?.policyAssetId;
	// Only native, spendable coins participate (a single asset keeps the balance math trivial).
	const coins = useMemo(
		() => (loaded?.utxos ?? []).filter((utxo) => utxo.assetId === policyAssetId && utxo.spendable),
		[loaded, policyAssetId],
	);

	const toggle = (utxo: Utxo) => {
		const key = utxoKey(utxo);
		setSelected((previous) => {
			const next = new Set(previous);
			if (next.has(key)) {
				next.delete(key);
			} else {
				// Split spends exactly one coin; selecting another replaces the selection.
				if (mode === "split") next.clear();
				next.add(key);
			}
			return next;
		});
	};

	const switchMode = (next: Mode) => {
		setMode(next);
		// Split allows a single input; drop all but the first if we came from merge.
		if (next === "split") {
			setSelected((previous) => new Set([...previous].slice(0, 1)));
		}
		submit.reset();
	};

	const selectedCoins = useMemo(
		() => coins.filter((utxo) => selected.has(utxoKey(utxo))),
		[coins, selected],
	);

	// Everything below is derived, in bigint base units, from the current selection.
	const plan = useMemo((): Plan => {
		const feeSats = /^\d+$/.test(fee.trim()) ? BigInt(fee.trim()) : null;
		const partCount = Number.parseInt(parts, 10);
		if (feeSats === null) return { error: "Fee must be a whole number of sats.", ok: false };
		if (selectedCoins.length === 0) return { error: "Select at least one coin.", ok: false };
		if (mode === "merge" && selectedCoins.length < 2) {
			return { error: "Merge needs at least two coins.", ok: false };
		}
		if (mode === "split" && (!Number.isInteger(partCount) || partCount < 2)) {
			return { error: "Split needs two or more parts.", ok: false };
		}

		const total = selectedCoins.reduce((sum, utxo) => sum + BigInt(utxo.amount), 0n);
		const spendable = total - feeSats;
		if (spendable <= 0n) return { error: "Fee is not smaller than the selected total.", ok: false };

		const outputAmounts = mode === "merge" ? [spendable] : splitAmounts(spendable, partCount);
		if (outputAmounts.some((amount) => amount <= 0n)) {
			return { error: "Too many parts for this amount.", ok: false };
		}

		return { feeSats, outputAmounts, ok: true, total };
	}, [fee, parts, mode, selectedCoins]);

	const canSubmit = plan.ok && !signing;

	const run = async () => {
		if (!plan.ok || !policyAssetId) return;
		const destinationAddress = selectedCoins[0].address;
		const result = await submit.run(() => {
			const { pset, signInputs } = buildCoinControlPset({
				destinationAddress,
				feeSats: plan.feeSats,
				inputs: selectedCoins,
				outputAmounts: plan.outputAmounts,
				policyAssetHex: rawAssetId(policyAssetId),
			});
			return wallet.signPset({ broadcast: true, pset, signInputs });
		});
		if (result.ok) {
			toast.success("Transaction broadcast", {
				description: result.data.txid ? truncateMiddle(result.data.txid, 10, 8) : undefined,
			});
		} else {
			toast.error(mode === "merge" ? "Merge failed" : "Split failed", {
				description: result.error,
			});
		}
	};

	const done = submit.status === "success" ? submit.data : undefined;

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="gap-0">
				<SheetHeader>
					<SheetTitle>Manage coins</SheetTitle>
					<SheetDescription>
						Merge or split your {ticker} coins. The wallet blinds, signs and broadcasts.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
					{done ? (
						<div className="flex flex-col gap-4">
							<div className="flex items-center gap-3">
								<CheckCircle2Icon className="size-5 text-emerald-500" />
								<div className="flex flex-col">
									<span className="text-sm font-medium">
										{mode === "merge" ? "Coins merged" : "Coin split"}
									</span>
									<span className="text-muted-foreground text-xs">Broadcast to the network.</span>
								</div>
							</div>
							{done.txid ? <ResultField label="Transaction id" value={done.txid} /> : null}
						</div>
					) : (
						<>
							<div className="grid grid-cols-2 gap-2">
								<Button
									variant={mode === "merge" ? "default" : "outline"}
									className="gap-2"
									onClick={() => switchMode("merge")}
								>
									<MergeIcon className="size-4" />
									Merge
								</Button>
								<Button
									variant={mode === "split" ? "default" : "outline"}
									className="gap-2"
									onClick={() => switchMode("split")}
								>
									<SplitIcon className="size-4" />
									Split
								</Button>
							</div>

							<p className="text-muted-foreground text-xs">
								{mode === "merge"
									? "Select two or more coins to combine into one."
									: "Select one coin to divide into several."}
							</p>

							{load.status === "error" && load.error ? (
								<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs">
									{load.error}
								</p>
							) : loading ? (
								<div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
									<Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
									Loading coins…
								</div>
							) : coins.length === 0 ? (
								<div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
									<CoinsIcon className="size-6 opacity-60" />
									No spendable {ticker} coins yet.
								</div>
							) : (
								<div className="divide-border border-border divide-y rounded-lg border">
									{coins.map((utxo) => {
										const key = utxoKey(utxo);
										return (
											<label
												key={key}
												htmlFor={key}
												className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-4 py-3"
											>
												<Checkbox
													id={key}
													checked={selected.has(key)}
													onCheckedChange={() => toggle(utxo)}
												/>
												<div className="flex flex-1 flex-col gap-0.5">
													<span className="text-sm font-medium">
														{formatLbtc(BigInt(utxo.amount))} {ticker}
													</span>
													<span className="text-muted-foreground font-mono text-xs break-all">
														{truncateMiddle(utxo.txid, 10, 8)}:{utxo.vout}
													</span>
												</div>
											</label>
										);
									})}
								</div>
							)}

							{mode === "split" ? (
								<TextField
									label="Parts"
									value={parts}
									mono={false}
									onChange={setParts}
									placeholder="2"
									hint="How many coins to split the selection into."
								/>
							) : null}

							<TextField
								label="Fee (sats)"
								value={fee}
								mono={false}
								onChange={setFee}
								placeholder={DEFAULT_FEE}
								hint="Explicit network fee, deducted from the selected total."
							/>

							{plan.ok ? (
								<div className="border-border rounded-lg border px-4 py-2">
									<ReviewRow
										label="Inputs"
										value={`${selectedCoins.length} · ${formatLbtc(plan.total)} ${ticker}`}
									/>
									<ReviewRow label="Fee" value={`${plan.feeSats} sats`} />
									<ReviewRow
										label={mode === "merge" ? "Output" : "Outputs"}
										value={plan.outputAmounts
											.map((amount) => `${formatLbtc(amount)} ${ticker}`)
											.join(" · ")}
									/>
								</div>
							) : selectedCoins.length > 0 ? (
								<p className="text-muted-foreground text-xs">{plan.error}</p>
							) : null}

							{submit.status === "error" && submit.error ? (
								<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs">
									{submit.error}
								</p>
							) : null}
						</>
					)}
				</div>

				<SheetFooter>
					{done ? (
						<Button onClick={() => handleOpenChange(false)}>Done</Button>
					) : (
						<Button disabled={!canSubmit} onClick={run}>
							{signing ? (
								<>
									<Loader2Icon className="animate-spin motion-reduce:animate-none" />
									{mode === "merge" ? "Merging…" : "Splitting…"}
								</>
							) : mode === "merge" ? (
								<>
									<MergeIcon />
									Merge &amp; broadcast
								</>
							) : (
								<>
									<SplitIcon />
									Split &amp; broadcast
								</>
							)}
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
