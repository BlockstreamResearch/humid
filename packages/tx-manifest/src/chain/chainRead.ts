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

export type OutPoint = { txid: string; vout: number };

export type TxOutAtOutPoint = {
	/** The output's scriptPubKey in hex — the locking condition itself. */
	scriptPubKeyHex: string;
};

export type ReadTxOut = (outpoint: OutPoint) => Promise<TxOutAtOutPoint>;
