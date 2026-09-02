/**
 * Deriving the asset an issuance creates.
 *
 * Neither the format's specification nor its standards draft says how the asset id is
 * computed; both say only that it is, and that the result is readable afterwards. The rule
 * belongs to Elements rather than to the format, so it is written here from what the chain
 * does and checked against assets that exist on Liquid.
 *
 * Three facts decide everything below. An asset is a function of the transaction output the
 * issuing input spends, which is why nothing here can run before that output is chosen. The
 * hash is not the usual double SHA-256 but a single compression of two 32-byte halves with
 * no padding, which Elements calls a fast merkle root and uses nowhere else a wallet meets.
 * And every id is written in reverse of how it is serialised, the same way a transaction id
 * is, so the boundary of this module converts and the middle of it does not.
 */

import { SHA256, sha256 } from "@noble/hashes/sha2.js";

import { decodeHex, encodeHex } from "./bytes";
import type { Outpoint } from "./outpoint";

export type { Outpoint };

/** What one issuance produces, in the form ids are written and read. */
export type DerivedIssuance = {
	/** The asset the issuance creates. */
	asset: string;
	/**
	 * What a later reissuance of this same asset is derived from.
	 *
	 * Kept because it is the only thing that survives the transaction: the outpoint is spent
	 * and cannot be asked again, so a protocol that ever reissues has to have recorded this.
	 */
	entropy: string;
	/**
	 * The token that authorises reissuing this asset.
	 *
	 * Derived whether or not any is minted, because the format exposes it by name inside an
	 * input's own hook and does not condition that on the amount. This is the unblinded form;
	 * the chain derives a different id when the issuance is blinded, and this wallet builds
	 * explicit transactions.
	 */
	reissuanceToken: string;
};

/**
 * The asset, token and entropy a first issuance on this outpoint produces.
 *
 * `contractHash` is the issuer contract the issuance commits to. Every asset in Liquid's
 * public registry commits to one; a manifest declares no such thing at any position, so the
 * commitment is empty here and saying that explicitly is the difference between a wallet
 * that established there is no contract and one that never looked for it.
 */
export function deriveNewIssuance(
	outpoint: Outpoint,
	contractHash = ZERO_HASH,
): DerivedIssuance | undefined {
	const spent = serialiseOutpoint(outpoint);
	const contract = readId(contractHash);

	if (!spent || !contract) {
		return undefined;
	}

	// The outpoint is hashed the ordinary way, twice, and only the combining step is the
	// unusual one.
	const entropy = combine(sha256(sha256(spent)), contract);

	return {
		asset: writeId(combine(entropy, ASSET)),
		entropy: writeId(entropy),
		reissuanceToken: writeId(combine(entropy, TOKEN)),
	};
}

/**
 * The asset a reissuance produces, from the entropy the first issuance left behind.
 *
 * Separate from {@link deriveNewIssuance} because a reissuance has no outpoint of its own to
 * derive from — the asset it mints is the one that already exists, and the input it sits on
 * spends the token rather than the origin.
 *
 * Nothing in this wallet reissues, and a request carries no entropy to reissue from, so no
 * caller here mints with this. It is kept because it is the only independent check on the
 * entropy a new issuance reports: that value is carried out of here, compared against what the
 * signing module derives, and would otherwise be thirty-two bytes nothing ever verified.
 * Running it back to an asset the chain already holds is what makes it a checked figure.
 */
export function assetFromEntropy(entropy: string): string | undefined {
	const bytes = readId(entropy);

	return bytes ? writeId(combine(bytes, ASSET)) : undefined;
}

/** No issuer contract, which is what every issuance a manifest declares commits to. */
const ZERO_HASH = "0".repeat(64);

/** The second half Elements combines an entropy with to reach the asset itself. */
const ASSET = new Uint8Array(32);

/** The second half that reaches the reissuance token instead, in its unblinded form. */
const TOKEN = Uint8Array.from([1, ...Array.from({ length: 31 }, () => 0)]);

/**
 * Elements' fast merkle root of two 32-byte values.
 *
 * One SHA-256 compression of the pair as a single block, taken before the padding and length
 * that finish an ordinary hash. A plain `sha256(left || right)` is a different value, and
 * one that would look entirely reasonable in a test that only checked its own output.
 */
function combine(left: Uint8Array, right: Uint8Array): Uint8Array {
	const block = new Uint8Array(64);

	block.set(left, 0);
	block.set(right, 32);

	return new Midstate().compress(block);
}

/**
 * SHA-256 stopped after one block, which the audited implementation exposes only to itself.
 *
 * Subclassed rather than reimplemented: the compression function is the whole of the hash,
 * and a hand-written copy of it would be the least reviewed cryptography in this wallet.
 */
class Midstate extends SHA256 {
	compress(block: Uint8Array): Uint8Array {
		this.process(new DataView(block.buffer, block.byteOffset, block.byteLength), 0);

		const out = new Uint8Array(32);
		const writer = new DataView(out.buffer);

		this.get().forEach((word, at) => writer.setUint32(at * 4, word >>> 0, false));

		return out;
	}
}

/** The 36 bytes an outpoint occupies: the transaction as serialised, then the index. */
function serialiseOutpoint(outpoint: Outpoint): Uint8Array | undefined {
	const transaction = readId(outpoint.txid);

	if (!transaction || !Number.isInteger(outpoint.vout) || outpoint.vout < 0) {
		return undefined;
	}

	const bytes = new Uint8Array(36);

	bytes.set(transaction, 0);
	new DataView(bytes.buffer).setUint32(32, outpoint.vout, true);

	return bytes;
}

/** An id as it is written turned into the bytes it is made of, which are the other way round. */
function readId(hex: string): Uint8Array | undefined {
	const bytes = decodeHex(hex);

	return bytes?.length === 32 ? bytes.toReversed() : undefined;
}

/** The same conversion back, because an id leaves here in the form everything else reads. */
function writeId(bytes: Uint8Array): string {
	return encodeHex(bytes.toReversed());
}
