import { generateCustomLiquidChainId } from "./createBuiltInLiquidChains";
import {
	LIQUID_CHAIN_GROUP_ID,
	LIQUID_NETWORK_KINDS,
	type LiquidChainRecord,
	parseLiquidChainRecord,
} from "./LiquidChainRecord";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads a network a dapp asks to add. A dapp-added network shares the testnet keys, so it may only be
 * a regtest one; a mainnet one could spend real funds under any name.
 */
export function parseDappChainProposal(
	params: unknown,
	known: readonly LiquidChainRecord[],
): LiquidChainRecord {
	const proposal = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
	const chain = parseLiquidChainRecord({
		chainGroupId: LIQUID_CHAIN_GROUP_ID,
		id: generateCustomLiquidChainId(),
		name: proposal.name,
		settings: proposal.settings,
	});
	const { backend, explorerUrl, network } = chain.settings;

	if (network !== LIQUID_NETWORK_KINDS.REGTEST) {
		throw new Error("A dapp can add regtest networks only. Add others in the wallet's settings.");
	}

	requireSafeUrl("backend", backend.url);

	if (explorerUrl !== undefined) requireSafeUrl("explorer", explorerUrl);

	const name = chain.name.trim().toLowerCase();

	if (known.some((other) => other.name.trim().toLowerCase() === name)) {
		throw new Error(`The wallet already has a network named "${chain.name}".`);
	}

	return chain;
}

function requireSafeUrl(role: string, url: string): void {
	let parsed: URL;

	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`The ${role} address "${url}" is not a URL.`);
	}

	const local = LOOPBACK_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".localhost");

	if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
		throw new Error(`The ${role} must use https, or plain http on this computer only.`);
	}
}
