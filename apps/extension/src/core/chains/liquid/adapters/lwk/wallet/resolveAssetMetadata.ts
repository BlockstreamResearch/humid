import type { LwkNetwork } from "../createLwkNetwork";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

/** Display metadata for an issued asset, resolved from LWK's registry. */
export type AssetMetadata = {
	decimals: number;
	/** The issuer's domain from the registry entry, or null when the entry carries none. */
	issuerDomain: string | null;
	name: string;
	symbol: string;
};

// Resolved issued-asset metadata, cached across scans (it rarely changes). Keyed by raw asset id
// — globally unique per network, so there are no cross-network collisions. The worker lives as
// long as the offscreen document, so this survives repeated scans.
const metadataCache = new Map<string, AssetMetadata>();

/**
 * Resolve ticker/name/precision for the given issued asset ids via LWK's asset registry
 * (assets.blockstream.info), caching results. Assets already cached are served from memory; a
 * registry that lacks an asset, or a lookup failure, resolves to nothing so callers keep their
 * placeholder. Best-effort — never throws and never blocks the scan.
 */
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
		// Seeds from the hardcoded assets and fetches the wallet's owned assets' contracts.
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
