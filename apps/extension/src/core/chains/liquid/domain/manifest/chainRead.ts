/**
 * Reading what the chain says sits at an outpoint.
 *
 * This exists because no component the wallet ships can answer that question: lwk's
 * Esplora client scans a descriptor and broadcasts, and the wallet's own UTXO snapshot
 * only ever contains outputs the wallet owns. A covenant output belongs to a contract.
 *
 * It is a read of public chain data — no key, no descriptor, no wallet state — which is
 * what makes reaching the endpoint directly acceptable here where writing to it would
 * not be. Broadcast stays with lwk.
 */

export type OutPoint = { txid: string; vout: number };

export type TxOutAtOutPoint = {
	/** Base-unit amount, when the output is explicit rather than confidential. */
	amountSats?: string;
	/** Raw asset id, when the output is explicit rather than confidential. */
	rawAssetId?: string;
	/** The address the output pays to, as the endpoint reports it. */
	scriptPubKeyAddress: string;
	/** The output's scriptPubKey in hex. */
	scriptPubKeyHex: string;
};

export type ReadTxOut = (outpoint: OutPoint) => Promise<TxOutAtOutPoint>;

export type EsploraEndpoint = {
	headers?: { name: string; value: string }[];
	url: string;
};

/**
 * Reads one output of one transaction from an Esplora endpoint.
 *
 * The endpoint is the one the chain record already configures for lwk, headers included,
 * so a private or authenticated backend keeps working without being configured twice.
 */
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

		const response = await fetchImpl(`${base}/tx/${txid}`, {
			headers: Object.fromEntries((endpoint.headers ?? []).map(({ name, value }) => [name, value])),
		});

		if (!response.ok) {
			throw new Error(`Could not read transaction ${txid}: ${response.status}`);
		}

		const body: unknown = await response.json();
		const outputs = isRecord(body) && Array.isArray(body.vout) ? body.vout : undefined;

		if (!outputs) {
			throw new Error(`Transaction ${txid} came back without outputs.`);
		}

		const output = outputs[vout];

		if (!isRecord(output)) {
			throw new Error(`Transaction ${txid} has no output at index ${vout}.`);
		}

		const scriptPubKeyHex = output.scriptpubkey;
		const scriptPubKeyAddress = output.scriptpubkey_address;

		if (typeof scriptPubKeyHex !== "string" || typeof scriptPubKeyAddress !== "string") {
			throw new Error(`Output ${txid}:${vout} came back without a scriptPubKey.`);
		}

		return {
			...(typeof output.value === "number" ? { amountSats: String(output.value) } : {}),
			...(typeof output.asset === "string" ? { rawAssetId: output.asset } : {}),
			scriptPubKeyAddress,
			scriptPubKeyHex,
		};
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
