import type { LiquidActivityEntry } from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import { toLiquidAssetId } from "../../../domain/validation";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;
type LwkWalletTx = ReturnType<LwkWollet["transactions"]>[number];
type LwkWalletTxOut = ReturnType<ReturnType<LwkWalletTx["outputs"]>[number]["get"]>;

export function readWalletBalanceForAsset(
	wollet: LwkWollet,
	chainId: LiquidChainId,
	rawAssetId: string,
): string {
	const entries = wollet.balance().entries();
	const assetId = toLiquidAssetId(chainId, rawAssetId);

	if (entries instanceof Map) {
		return amountToString(entries.get(rawAssetId) ?? entries.get(assetId));
	}

	if (Array.isArray(entries)) {
		const entry = entries.find(
			(entryValue): entryValue is [unknown, unknown] =>
				Array.isArray(entryValue) && String(entryValue[0]) === rawAssetId,
		);

		return amountToString(entry?.[1]);
	}

	if (typeof entries === "object" && entries !== null) {
		const objectEntries = entries as Record<string, unknown>;

		return amountToString(objectEntries[rawAssetId] ?? objectEntries[assetId]);
	}

	return "0";
}

export function readWalletActivity(
	wollet: LwkWollet,
	rawAssetId: string | null,
): LiquidActivityEntry[] {
	const entries = wollet.transactions().flatMap((walletTx) => {
		const nets = new Map<string, bigint>();
		const add = (asset: string, amount: bigint) =>
			nets.set(asset, (nets.get(asset) ?? 0n) + amount);

		for (const [asset, amount] of balanceEntries(walletTx.balance())) add(asset, amount);
		for (const output of walletTx.outputs()) addExplicit(output.get(), 1n, add);
		for (const input of walletTx.inputs()) addExplicit(input.get(), -1n, add);

		const changes = [...nets]
			.filter(([asset, amount]) => amount !== 0n && (rawAssetId === null || asset === rawAssetId))
			.map(([asset, amount]) => ({ amountSats: amount.toString(), rawAssetId: asset }));

		if (changes.length === 0) return [];

		const timestamp = walletTx.timestamp();

		return [
			{
				changes,
				feeSats: walletTx.fee().toString(),
				timestamp: typeof timestamp === "number" ? timestamp : null,
				txid: walletTx.txid().toString(),
			} satisfies LiquidActivityEntry,
		];
	});

	return entries.toSorted(
		(a, b) => (b.timestamp ?? Number.POSITIVE_INFINITY) - (a.timestamp ?? Number.POSITIVE_INFINITY),
	);
}

function addExplicit(
	txOut: LwkWalletTxOut,
	sign: bigint,
	add: (asset: string, amount: bigint) => void,
): void {
	const secrets = txOut?.unblinded();

	if (secrets?.isExplicit()) add(secrets.asset().toString(), sign * secrets.value());
}

function amountToString(value: unknown): string {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
	if (typeof value === "string" && /^\d+$/u.test(value)) return value;

	return "0";
}

function balanceEntries(balance: { entries: () => unknown }): [string, bigint][] {
	const entries = balance.entries();
	const pairs: [unknown, unknown][] =
		entries instanceof Map
			? [...entries]
			: Array.isArray(entries)
				? entries.filter((entry): entry is [unknown, unknown] => Array.isArray(entry))
				: typeof entries === "object" && entries !== null
					? Object.entries(entries)
					: [];

	return pairs.map(([asset, amount]) => [String(asset), toBigInt(amount)]);
}

function toBigInt(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
	if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);

	return 0n;
}
