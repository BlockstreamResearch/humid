import type { LwkNetwork } from "../createLwkNetwork";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

export type AssetMetadata = {
	decimals: number;
	issuerDomain: string | null;
	name: string;
	symbol: string;
};

const metadataCache = new Map<string, AssetMetadata>();

export async function resolveIssuedAssetMetadata(
	lwk: LwkWasmModule,
	network: LwkNetwork,
	wollet: LwkWollet,
	issuedRawAssetIds: readonly string[],
): Promise<Map<string, AssetMetadata>> {
	const resolved = new Map<string, AssetMetadata>();

	for (const rawAssetId of issuedRawAssetIds) {
		const cached = metadataCache.get(rawAssetId);

		if (cached) resolved.set(rawAssetId, cached);
	}

	const uncached = issuedRawAssetIds.filter((rawAssetId) => !metadataCache.has(rawAssetId));

	if (uncached.length === 0) return resolved;

	try {
		const registry = await lwk.Registry.defaultForNetwork(network, wollet.assetsOwned());

		for (const rawAssetId of uncached) {
			const data = registry.get(lwk.AssetId.fromString(rawAssetId));

			if (!data) continue;

			const domain = data.domain();
			const metadata: AssetMetadata = {
				decimals: data.precision(),
				issuerDomain: domain.length > 0 ? domain : null,
				name: data.name(),
				symbol: data.ticker(),
			};

			metadataCache.set(rawAssetId, metadata);
			resolved.set(rawAssetId, metadata);
		}

		registry.free();
	} catch (error) {
		console.warn("[liquid-sync] asset registry lookup failed", error);
	}

	return resolved;
}
