import { UiButton } from "@/ui/UiButton/base";
import { UiCollapsible, UiCollapsibleContent, UiCollapsibleTrigger } from "@/ui/UiCollapsible";
import { UiField, UiFieldDescription, UiFieldGroup, UiFieldLabel } from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";
import { UiSwitch } from "@/ui/UiSwitch";
import { UiTabs, UiTabsList, UiTabsTrigger } from "@/ui/UiTabs/base";

import {
	LIQUID_CHAIN_BACKENDS,
	LIQUID_NETWORK_KINDS,
	type LiquidChainBackend,
	type LiquidChainRecord,
	type LiquidChainSettings as LiquidChainSettingsModel,
	type LiquidHttpHeader,
} from "./LiquidChainRecord";

function parseIntInRange(value: string, min: number, max: number): number | undefined {
	const trimmed = value.trim();

	if (trimmed === "") return undefined;

	const parsed = Number(trimmed);

	if (!Number.isFinite(parsed)) return undefined;

	return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export type LiquidChainSettingsProps = {
	chain: LiquidChainRecord;
	onChange: (chain: LiquidChainRecord) => void;
};

/**
 * Editable settings for an existing Liquid chain: the backend (URL + Waterfalls flag,
 * headers, request tuning) and explorer, plus the policy asset for custom (regtest)
 * chains. The network kind is a chain's fixed identity and is chosen only when adding
 * (see LiquidChainCreate), never here.
 */
export function LiquidChainSettings({ chain, onChange }: LiquidChainSettingsProps) {
	const settings = chain.settings;
	const backend = settings.backend;
	const headers = backend.headers ?? [];
	const isCustom = settings.network === LIQUID_NETWORK_KINDS.REGTEST;

	const patchSettings = (patch: Partial<LiquidChainSettingsModel>) => {
		onChange({ ...chain, settings: { ...settings, ...patch } });
	};

	const patchBackend = (patch: Partial<LiquidChainBackend>) => {
		patchSettings({ backend: { ...backend, ...patch } });
	};

	const setHeaders = (next: LiquidHttpHeader[]) => {
		patchBackend({ headers: next.length > 0 ? next : undefined });
	};

	const backendKind = backend.waterfalls
		? LIQUID_CHAIN_BACKENDS.WATERFALLS
		: LIQUID_CHAIN_BACKENDS.ESPLORA;

	return (
		<UiFieldGroup>
			{isCustom && (
				<UiField>
					<UiFieldLabel htmlFor="liquid-policy-asset">Policy asset (L-BTC)</UiFieldLabel>
					<UiInput
						id="liquid-policy-asset"
						placeholder="5ac9f65c…"
						value={settings.policyAsset ?? ""}
						onChange={(event) => patchSettings({ policyAsset: event.target.value || undefined })}
					/>
					<UiFieldDescription>
						The custom network's L-BTC asset id. Leave empty to use LWK's default regtest asset.
					</UiFieldDescription>
				</UiField>
			)}

			<UiField>
				<UiFieldLabel>Backend</UiFieldLabel>
				<UiTabs
					value={backendKind}
					onValueChange={(value) =>
						patchBackend({ waterfalls: value === LIQUID_CHAIN_BACKENDS.WATERFALLS })
					}
				>
					<UiTabsList variant="line">
						<UiTabsTrigger value={LIQUID_CHAIN_BACKENDS.ESPLORA}>Esplora</UiTabsTrigger>
						<UiTabsTrigger value={LIQUID_CHAIN_BACKENDS.WATERFALLS}>Waterfalls</UiTabsTrigger>
					</UiTabsList>
				</UiTabs>
				<UiInput
					placeholder="https://blockstream.info/liquid/api"
					value={backend.url}
					onChange={(event) => patchBackend({ url: event.target.value })}
				/>
			</UiField>

			<UiField>
				<UiFieldLabel>Headers</UiFieldLabel>
				{headers.map((header, index) => (
					<div key={index} className="flex items-center gap-2">
						<UiInput
							placeholder="Header"
							value={header.name}
							onChange={(event) =>
								setHeaders(
									headers.map((current, position) =>
										position === index ? { ...current, name: event.target.value } : current,
									),
								)
							}
						/>
						<UiInput
							placeholder="Value"
							value={header.value}
							onChange={(event) =>
								setHeaders(
									headers.map((current, position) =>
										position === index ? { ...current, value: event.target.value } : current,
									),
								)
							}
						/>
						<UiButton
							aria-label="Remove header"
							onClick={() => setHeaders(headers.filter((_, position) => position !== index))}
							size="icon-sm"
							type="button"
							variant="ghost"
						>
							<span aria-hidden>×</span>
						</UiButton>
					</div>
				))}
				<UiButton
					className="w-fit"
					onClick={() => setHeaders([...headers, { name: "", value: "" }])}
					size="sm"
					type="button"
					variant="outline"
				>
					Add header
				</UiButton>
				<UiFieldDescription>
					Sent on every request — use for servers that require an API key (e.g.{" "}
					<code>Authorization</code> or <code>x-api-key</code>).
				</UiFieldDescription>
			</UiField>

			<UiCollapsible className="flex flex-col gap-4" defaultOpen={false}>
				<UiCollapsibleTrigger className="text-muted-foreground hover:text-foreground w-fit text-sm font-medium">
					Advanced
				</UiCollapsibleTrigger>
				<UiCollapsibleContent className="flex flex-col gap-4">
					<UiField orientation="horizontal">
						<UiFieldLabel htmlFor="liquid-utxo-only">UTXO only</UiFieldLabel>
						<UiSwitch
							checked={backend.utxoOnly === true}
							id="liquid-utxo-only"
							onCheckedChange={(checked) => patchBackend({ utxoOnly: checked ? true : undefined })}
						/>
					</UiField>
					<UiField>
						<UiFieldLabel htmlFor="liquid-timeout">Timeout (seconds)</UiFieldLabel>
						<UiInput
							id="liquid-timeout"
							max={255}
							min={0}
							type="number"
							value={backend.timeout ?? ""}
							onChange={(event) =>
								patchBackend({ timeout: parseIntInRange(event.target.value, 0, 255) })
							}
						/>
					</UiField>
					<UiField>
						<UiFieldLabel htmlFor="liquid-concurrency">Concurrency</UiFieldLabel>
						<UiInput
							id="liquid-concurrency"
							min={1}
							type="number"
							value={backend.concurrency ?? ""}
							onChange={(event) =>
								patchBackend({ concurrency: parseIntInRange(event.target.value, 1, 1000) })
							}
						/>
					</UiField>
				</UiCollapsibleContent>
			</UiCollapsible>

			<UiField>
				<UiFieldLabel htmlFor="liquid-explorer-url">Explorer URL</UiFieldLabel>
				<UiInput
					id="liquid-explorer-url"
					placeholder="https://blockstream.info/liquid/"
					value={settings.explorerUrl ?? ""}
					onChange={(event) => patchSettings({ explorerUrl: event.target.value || undefined })}
				/>
				<UiFieldDescription>Used for &ldquo;view on explorer&rdquo; links.</UiFieldDescription>
			</UiField>
		</UiFieldGroup>
	);
}
