/**
 * The one reading of "a number of base units" this package accepts from outside it.
 *
 * A chain reader is a wallet's, not this package's: it may be an endpoint client, a cache, a
 * test double or something nobody here has seen, and what it hands back is text. `BigInt("")`
 * is zero, `BigInt("0x10")` is sixteen, and `BigInt("1.5")` throws — so an amount taken on
 * trust is either a number nobody reported, a number in a base nobody meant, or an exception
 * escaping a function whose whole contract is to return a refusal instead.
 *
 * So it is parsed once, here, against exactly one spelling: decimal digits, no sign, no
 * separators, no leading `0x`, and inside the range a transaction can actually carry. Anything
 * else is not a smaller amount — it is an amount this wallet was never told.
 */

/**
 * The largest amount a value in this encoding holds.
 *
 * Signed sixty-four bit, which is what the arithmetic every manifest was authored against uses
 * and what the module underneath this ultimately writes. A figure above it is not a large
 * amount, it is one that cannot be put in a transaction at all — and a bigint carries it
 * happily all the way to the wasm boundary, where it becomes somebody else's exception.
 */
export const MAX_BASE_UNITS = 2n ** 63n - 1n;

/** Decimal digits and nothing else: no sign, no radix prefix, no separators, no exponent. */
const BASE_UNITS = /^(?:0|[1-9]\d*)$/;

/**
 * The amount this text states, or nothing where it states no amount this wallet can act on.
 *
 * A leading zero and surrounding space are refused along with the rest, and not out of
 * fussiness: two spellings of one amount are two byte strings and one number, and a boundary
 * that quietly accepts both has become a place where what the wallet was told and what it
 * compares can differ. There is one spelling, and a reader that cannot produce it has not
 * reported an amount.
 */
export function baseUnits(text: string): bigint | undefined {
	if (!BASE_UNITS.test(text)) {
		return undefined;
	}

	const value = BigInt(text);

	return value > MAX_BASE_UNITS ? undefined : value;
}
