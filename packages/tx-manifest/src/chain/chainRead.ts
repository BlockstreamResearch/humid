/**
 * Reading what the chain says sits at an outpoint.
 *
 * This is a port rather than a reader: what is here is the shape of the answer and the shape
 * of the asking, and the wallet supplies the thing that actually asks. The package holds no
 * endpoint and opens no connection of its own — that is what keeps the same request answered
 * the same way twice, and what lets every check below be exercised without a network.
 *
 * It exists at all because no component a wallet ships can answer the question. A wallet's
 * UTXO snapshot only ever contains outputs the wallet owns, and a covenant output belongs to
 * a contract rather than to anyone. What is read is public chain data: no key, no descriptor,
 * no wallet state.
 */

import { encodeHex } from "./bytes";
import { txOutAt } from "./rawTransaction";

export type OutPoint = { txid: string; vout: number };

export type TxOutAtOutPoint = {
	/**
	 * Base-unit amount, when the output states one rather than committing to it.
	 *
	 * Absent for a confidential output, and absent for a reader that does not report it. Never
	 * a stand-in: an amount nobody read is left unsaid rather than written as zero, because a
	 * covenant said to hold zero and one whose holding was never established are the same
	 * value and not the same fact, and only one of them can be safely netted against an
	 * action's cost.
	 */
	amountSats?: string;
	/** The asset id the output states, under the same rule and for the same reason. */
	rawAssetId?: string;
	/** The output's scriptPubKey in hex — the locking condition itself. */
	scriptPubKeyHex: string;
	/**
	 * The output exactly as the chain holds it, to hand to something that spends it.
	 *
	 * Carried because a signing module adding a covenant input is given the outpoint and these
	 * bytes and nothing else. Taken from the transaction rather than rebuilt from the fields
	 * above: a re-encoding that differs from the chain by a byte produces a signature over a
	 * transaction the network will not accept, and nothing here could say why.
	 */
	txOutHex: string;
};

export type ReadTxOut = (outpoint: OutPoint) => Promise<TxOutAtOutPoint>;

/**
 * Reads a fee rate the wallet is willing to pay, in satoshis per kilo-vbyte.
 *
 * The fee is the wallet's business, not the requester's. A request has no field to put one
 * in: the parser accepts a closed set of keys, so a `fee` or `feeRate` alongside them is a
 * malformed request rather than a value that gets quietly dropped — the difference between a
 * site being told no and a site finding out what it can slip past.
 *
 * So the rate is read, and an action is refused rather than built when none can be. Guessing
 * a default here would convert "we do not know" into "we are sure", which is the failure this
 * refusal exists to prevent.
 */
export type ReadFeeRate = (targetBlocks: number) => Promise<number>;

/**
 * Where a wallet asks, and under whose headers.
 *
 * The endpoint is the one the chain record already configures for its own scanning, headers
 * included, so a private or authenticated backend keeps working without being configured a
 * second time in a second place.
 */
export type EsploraEndpoint = {
	headers?: { name: string; value: string }[];
	url: string;
};

/**
 * Reads one output of one transaction from an Esplora endpoint.
 *
 * It asks for the transaction's bytes rather than a server's summary of them, for two reasons.
 * The summary route is not universal — the Waterfalls server this wallet uses for Liquid
 * testnet serves the descriptor scan and answers 404 to a plain transaction lookup, while
 * every Esplora serves the raw one. And the bytes are what a signing module has to be handed,
 * so taking them directly removes a re-encoding that could differ from the chain by a byte.
 */
export function createEsploraTxOutReader(
	endpoint: EsploraEndpoint,
	fetchImpl: typeof fetch = fetch,
): ReadTxOut {
	const base = endpoint.url.replace(/\/+$/, "");

	return async ({ txid, vout }) => {
		// Checked before it is put into a URL rather than after the endpoint complains. A txid
		// arrives here from a state file the site supplied, and anything that is not thirty-two
		// bytes of hex is a path segment rather than an identifier.
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

		// Esplora keys its estimates by confirmation target. Take the one asked for, else the
		// nearest slower one: paying for a longer wait than asked is the safe direction to be
		// wrong in, and paying for a shorter one is the wallet spending money nobody agreed to.
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

/**
 * How high the chain is, for an action whose covenant is time-locked.
 *
 * A contract branch guarded by a lock height reads the transaction's own locktime, and a
 * transaction declaring none satisfies no such branch. What a wallet can say for itself is
 * where the chain is now — the same answer every wallet writes there, carrying no knowledge
 * of any protocol.
 */
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

		// A height read as `NaN` is what a body that is not a number comes back as, and writing
		// it into a locktime is a transaction the network answers about at broadcast rather than
		// here. Refused, so the caller's own fallback — no locktime at all — is what happens.
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
