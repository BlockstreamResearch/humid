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
