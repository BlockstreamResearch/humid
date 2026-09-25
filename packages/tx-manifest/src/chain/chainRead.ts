import { encodeHex } from "./bytes";
import { txOutAt } from "./rawTransaction";

export type OutPoint = { txid: string; vout: number };

export type TxOutAtOutPoint = {
	amountSats?: string;
	rawAssetId?: string;
	scriptPubKeyHex: string;
	txOutHex: string;
};

export type ReadTxOut = (outpoint: OutPoint) => Promise<TxOutAtOutPoint>;

export type ReadFeeRate = (targetBlocks: number) => Promise<number>;

export type EsploraEndpoint = {
	headers?: { name: string; value: string }[];
	url: string;
};

export function createEsploraTxOutReader(
	endpoint: EsploraEndpoint,
	fetchImpl: typeof fetch = fetch,
): ReadTxOut {
	const base = endpoint.url.replace(/\/+$/, "");

	return async ({ txid, vout }) => {
		if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
			throw new Error(`Not a transaction id: ${txid}`);
		}

		if (!Number.isInteger(vout) || vout < 0) {
			throw new Error(`Not an output index: ${vout}`);
		}

		const response = await fetchImpl(`${base}/tx/${txid}/raw`, { headers: headersOf(endpoint) });

		if (!response.ok) {
			throw new Error(`Could not read transaction ${txid}: ${response.status}`);
		}

		const parsed = txOutAt(encodeHex(new Uint8Array(await response.arrayBuffer())), vout);

		if (!parsed.ok) {
			throw new Error(`Reading ${txid}:${vout}: ${parsed.reason}`);
		}

		const { amountSats, rawAssetId, scriptPubKeyHex, txOutHex } = parsed.txOut;

		return {
			...(amountSats === undefined ? {} : { amountSats }),
			...(rawAssetId === undefined ? {} : { rawAssetId }),
			scriptPubKeyHex,
			txOutHex,
		};
	};
}

export function createEsploraFeeRateReader(
	endpoint: EsploraEndpoint,
	fetchImpl: typeof fetch = fetch,
): ReadFeeRate {
	const base = endpoint.url.replace(/\/+$/, "");

	return async (targetBlocks) => {
		const response = await fetchImpl(`${base}/fee-estimates`, { headers: headersOf(endpoint) });

		if (!response.ok) {
			throw new Error(`Could not read fee estimates: ${response.status}`);
		}

		const body: unknown = await response.json();

		if (!isRecord(body)) {
			throw new Error("Fee estimates came back in a shape this wallet does not understand.");
		}

		const targets = Object.keys(body)
			.map(Number)
			.filter((value) => Number.isFinite(value))
			.toSorted((one, other) => one - other);
		const chosen = targets.find((value) => value >= targetBlocks) ?? targets.at(-1);
		const satsPerVbyte = chosen === undefined ? undefined : body[String(chosen)];

		if (typeof satsPerVbyte !== "number" || !(satsPerVbyte > 0)) {
			throw new Error("No usable fee estimate was returned.");
		}

		return satsPerVbyte * 1000;
	};
}

export type ReadChainTip = () => Promise<number>;

export function createEsploraChainTipReader(
	endpoint: EsploraEndpoint,
	fetchImpl: typeof fetch = fetch,
): ReadChainTip {
	const base = endpoint.url.replace(/\/+$/, "");

	return async () => {
		const response = await fetchImpl(`${base}/blocks/tip/height`, { headers: headersOf(endpoint) });

		if (!response.ok) {
			throw new Error(`Could not read the chain tip: ${response.status}`);
		}

		const height = Number(await response.text());

		if (!Number.isInteger(height) || height < 0) {
			throw new Error("The chain tip came back as something that is not a block height.");
		}

		return height;
	};
}

function headersOf(endpoint: EsploraEndpoint): Record<string, string> {
	return Object.fromEntries((endpoint.headers ?? []).map(({ name, value }) => [name, value]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
