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

/**
 * Re-encodes an explicit output so it can be handed to something that spends it.
 *
 * Only valid for an explicit output, which for this purpose is not a limitation: a
 * covenant output is always unblinded, because Simplicity's introspection jets cannot read
 * a confidential commitment. A confidential one returns undefined rather than a plausible
 * encoding, since guessing here would produce a transaction that fails far away from the
 * cause.
 */
export function encodeExplicitTxOut(txOut: TxOutAtOutPoint): string | undefined {
	if (txOut.amountSats === undefined || txOut.rawAssetId === undefined) {
		return undefined;
	}

	// Elements consensus encoding: explicit asset (0x01 + 32 bytes, reversed), explicit
	// value (0x01 + 8 bytes big-endian), null nonce, then the script with its length.
	const assetLittleEndian = (txOut.rawAssetId.match(/../g) ?? []).reverse().join("");
	const value = BigInt(txOut.amountSats).toString(16).padStart(16, "0");
	const scriptLength = (txOut.scriptPubKeyHex.length / 2).toString(16).padStart(2, "0");

	return `01${assetLittleEndian}01${value}00${scriptLength}${txOut.scriptPubKeyHex}`;
}

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

/**
 * Reads a fee rate the wallet is willing to pay, in satoshis per kilo-vbyte.
 *
 * The fee is the wallet's business, not the requester's: a fee or fee rate arriving in a
 * request is ignored, and an action is refused rather than built when no rate can be
 * established. Guessing a default here would quietly convert "we do not know" into "we
 * are sure", which is the failure this refusal exists to prevent.
 */
export type ReadFeeRate = (targetBlocks: number) => Promise<number>;

export function createEsploraFeeRateReader(
	endpoint: EsploraEndpoint,
	fetchImpl: typeof fetch = fetch,
): ReadFeeRate {
	const base = endpoint.url.replace(/\/+$/, "");

	return async (targetBlocks) => {
		const response = await fetchImpl(`${base}/fee-estimates`, {
			headers: Object.fromEntries((endpoint.headers ?? []).map(({ name, value }) => [name, value])),
		});

		if (!response.ok) {
			throw new Error(`Could not read fee estimates: ${response.status}`);
		}

		const body: unknown = await response.json();

		if (!isRecord(body)) {
			throw new Error("Fee estimates came back in a shape this wallet does not understand.");
		}

		// Esplora keys estimates by confirmation target. Take the requested target, else the
		// nearest slower one, since paying for a longer wait than asked is the safe direction
		// to be wrong in.
		const targets = Object.keys(body)
			.map(Number)
			.filter((value) => Number.isFinite(value))
			.sort((a, b) => a - b);
		const chosen = targets.find((value) => value >= targetBlocks) ?? targets.at(-1);
		const satsPerVbyte = chosen === undefined ? undefined : body[String(chosen)];

		if (typeof satsPerVbyte !== "number" || !(satsPerVbyte > 0)) {
			throw new Error("No usable fee estimate was returned.");
		}

		return satsPerVbyte * 1000;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
