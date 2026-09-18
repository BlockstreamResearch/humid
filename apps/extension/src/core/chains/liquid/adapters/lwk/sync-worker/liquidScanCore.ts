import type {
	LiquidActivityPage,
	LiquidAssetBalance,
	LiquidWalletSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_NATIVE_ASSET } from "../../../domain/LiquidAsset";
import { createLwkBlockchainClient } from "../createLwkBlockchainClient";
import { createLwkNetwork, type LwkNetwork } from "../createLwkNetwork";
import { loadLwkWasm, type LwkWasmModule } from "../loadLwkWasm";
import { readWalletActivityForAsset, readWalletAssetBalances } from "../wallet/readWalletData";
import { readWalletUtxos } from "../wallet/readWalletUtxos";
import { type AssetMetadata, resolveIssuedAssetMetadata } from "../wallet/resolveAssetMetadata";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

export type LiquidScanInput = {
	chain: LiquidChainRecord;
	descriptor: string;
	id: number;
};

export type LiquidReadActivityInput = LiquidScanInput & {
	cursor: string | null;
	limit: number;
	rawAssetId: string;
};

export type LiquidBroadcastInput = {
	chain: LiquidChainRecord;
	id: number;
	psetBase64: string;
};

export type LiquidBroadcastTxInput = {
	chain: LiquidChainRecord;
	id: number;
	txHex: string;
};

const DEFAULT_ISSUED_ASSET_DECIMALS = 8;

const wolletCache = new Map<string, LwkWollet>();

function wolletCacheKey(input: { chain: LiquidChainRecord; descriptor: string }): string {
	return `${input.chain.id}:${input.chain.settings.policyAsset ?? ""}:${input.descriptor}`;
}

export async function scanFresh(input: LiquidScanInput): Promise<Uint8Array | null> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const wollet = new lwk.Wollet(network, new lwk.WolletDescriptor(input.descriptor));
	const client = createLwkBlockchainClient(lwk, input.chain, network);

	console.warn("[liquid-sync] scan (fresh) fullScan…", { chainId: input.chain.id, id: input.id });
	const scanStartedAt = Date.now();
	const update = await client.fullScan(wollet);

	console.warn("[liquid-sync] scan (fresh) done", {
		hasUpdate: Boolean(update),
		id: input.id,
		ms: Date.now() - scanStartedAt,
	});

	const updateBytes = update ? update.serialize() : null;

	update?.free();
	client.free();
	wollet.free();

	return updateBytes;
}

export async function broadcastPset(input: LiquidBroadcastInput): Promise<string> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const client = createLwkBlockchainClient(lwk, input.chain, network);
	const pset = new lwk.Pset(input.psetBase64);

	console.warn("[liquid-sync] broadcast…", { chainId: input.chain.id, id: input.id });
	const startedAt = Date.now();
	const txid = await client.broadcast(pset);
	const txidString = txid.toString();

	console.warn("[liquid-sync] broadcast done", {
		id: input.id,
		ms: Date.now() - startedAt,
		txid: txidString,
	});

	txid.free();
	pset.free();
	client.free();

	return txidString;
}

export async function broadcastTransaction(input: LiquidBroadcastTxInput): Promise<string> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const client = createLwkBlockchainClient(lwk, input.chain, network);
	const transaction = lwk.Transaction.fromString(input.txHex);

	console.warn("[liquid-sync] broadcast tx…", { chainId: input.chain.id, id: input.id });
	const startedAt = Date.now();
	const txid = await client.broadcastTx(transaction);
	const txidString = txid.toString();

	console.warn("[liquid-sync] broadcast tx done", {
		id: input.id,
		ms: Date.now() - startedAt,
		txid: txidString,
	});

	txid.free();
	transaction.free();
	client.free();

	return txidString;
}

export async function scanAndRead(input: LiquidScanInput): Promise<LiquidWalletSnapshot> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const cacheKey = wolletCacheKey(input);

	let wollet = wolletCache.get(cacheKey);

	console.warn("[liquid-sync] scanAndRead start", {
		cachedWollet: Boolean(wollet),
		chainId: input.chain.id,
		id: input.id,
	});

	if (!wollet) {
		wollet = new lwk.Wollet(network, new lwk.WolletDescriptor(input.descriptor));
		wolletCache.set(cacheKey, wollet);
	}

	const client = createLwkBlockchainClient(lwk, input.chain, network);

	console.warn("[liquid-sync] fullScan…", { id: input.id });
	const scanStartedAt = Date.now();
	const update = await client.fullScan(wollet);

	console.warn("[liquid-sync] fullScan done", {
		hasUpdate: Boolean(update),
		id: input.id,
		ms: Date.now() - scanStartedAt,
	});

	if (update) wollet.applyUpdate(update);

	update?.free();
	client.free();

	const rawPolicyAssetId = network.policyAsset().toString();
	const assets = await buildAssetBalances(
		lwk,
		network,
		wollet,
		readWalletAssetBalances(wollet),
		rawPolicyAssetId,
	);

	const utxos = readWalletUtxos(wollet);

	console.warn("[liquid-sync] scanAndRead done", {
		assetCount: assets.length,
		id: input.id,
		ms: Date.now() - scanStartedAt,
		utxoCount: utxos.length,
	});

	return { assets, utxos };
}

export function readActivity(input: LiquidReadActivityInput): LiquidActivityPage {
	const wollet = wolletCache.get(wolletCacheKey(input));

	if (!wollet) return { items: [], nextCursor: null };

	const all = readWalletActivityForAsset(wollet, input.rawAssetId);
	const offset = parseActivityCursor(input.cursor);
	const items = all.slice(offset, offset + input.limit);
	const nextOffset = offset + items.length;

	return { items, nextCursor: nextOffset < all.length ? String(nextOffset) : null };
}

function parseActivityCursor(cursor: string | null): number {
	if (cursor === null) return 0;

	const parsed = Number.parseInt(cursor, 10);

	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function buildAssetBalances(
	lwk: LwkWasmModule,
	network: LwkNetwork,
	wollet: LwkWollet,
	balances: Map<string, bigint>,
	rawPolicyAssetId: string,
): Promise<LiquidAssetBalance[]> {
	const issuedRawAssetIds = [...balances.keys()].filter(
		(rawAssetId) => rawAssetId !== rawPolicyAssetId,
	);
	const metadata = await resolveIssuedAssetMetadata(lwk, network, wollet, issuedRawAssetIds);

	const assets = [...balances].map(([rawAssetId, sats]) =>
		toAssetBalance(rawAssetId, sats, rawPolicyAssetId, metadata.get(rawAssetId)),
	);

	if (!assets.some((asset) => asset.isNative)) {
		assets.push(toAssetBalance(rawPolicyAssetId, 0n, rawPolicyAssetId, undefined));
	}

	return assets.toSorted((a, b) => {
		if (a.isNative !== b.isNative) return a.isNative ? -1 : 1;

		const diff = BigInt(b.amountSats) - BigInt(a.amountSats);

		return diff > 0n ? 1 : diff < 0n ? -1 : 0;
	});
}

function toAssetBalance(
	rawAssetId: string,
	sats: bigint,
	rawPolicyAssetId: string,
	metadata: AssetMetadata | undefined,
): LiquidAssetBalance {
	const isNative = rawAssetId === rawPolicyAssetId;
	const label = `${rawAssetId.slice(0, 4)}…${rawAssetId.slice(-4)}`;

	if (isNative) {
		return {
			amountSats: sats.toString(),
			decimals: LIQUID_NATIVE_ASSET.decimals,
			isNative,
			metadata: { isNative, issuerDomain: null, verified: true },
			name: LIQUID_NATIVE_ASSET.name,
			rawAssetId,
			symbol: LIQUID_NATIVE_ASSET.symbol,
		};
	}

	return {
		amountSats: sats.toString(),
		decimals: metadata?.decimals ?? DEFAULT_ISSUED_ASSET_DECIMALS,
		isNative,
		metadata: {
			isNative,
			issuerDomain: metadata?.issuerDomain ?? null,
			verified: metadata !== undefined,
		},
		name: metadata?.name ?? label,
		rawAssetId,
		symbol: metadata?.symbol ?? label,
	};
}
