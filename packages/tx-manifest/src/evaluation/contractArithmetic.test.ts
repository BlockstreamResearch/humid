import { describe, expect, test } from "bun:test";

import { evaluateExpression } from "./evaluate";

/**
 * The wallet's arithmetic against the covenant's, for the formulas a live protocol writes.
 *
 * The format defines no arithmetic. Overflow, division by zero, associativity and truncation
 * are all undefined in the specification, so nothing in a document says which reading is meant
 * and two runtimes can disagree without either being wrong on paper. What settles it is the
 * contract: it is the thing that will accept or reject the transaction, after it is signed, for
 * a reason nobody watching could predict.
 *
 * So the contract's own arithmetic is transcribed below from the published SimplicityHL source
 * and the wallet is compared against it, rather than both being compared against a description.
 *
 * From `lending.simf` in the deployed protocol's contract crate:
 *
 * ```
 * fn mul_div(x: u64, y: u64, denominator: u64) -> u64 {
 *     let product: u128 = jet::multiply_64(x, y);
 *     let (hi, lo): (u64, u64) = <u128>::into(product);
 *     check_asset_amounts_eq(hi, 0);
 *     jet::divide_64(lo, denominator)
 * }
 * fn get_max_basis_points() -> u64 { 10_000 }
 * fn apply_basis_points(amount: u64, bps: u64) -> u64 { mul_div(amount, bps, get_max_basis_points()) }
 * fn get_protocol_fee_bps() -> u64 { 1_000 }
 * fn get_protocol_fee_amount(fee_amount: u64) -> u64 { apply_basis_points(fee_amount, get_protocol_fee_bps()) }
 * fn get_total_fee_amount() -> u64 { apply_basis_points(param::PRINCIPAL_AMOUNT, param::PRINCIPAL_INTEREST_RATE) }
 * fn get_total_amount_to_repay() -> u64 { safe_add_64(param::PRINCIPAL_AMOUNT, get_total_fee_amount()) }
 * ```
 *
 * `safe_add_64` asserts no carry out of 64 bits; `mul_div` asserts the product's high word is
 * zero. Both are unsigned 64-bit. That is the one place the two runtimes are not identical, and
 * the direction of the difference is what makes it safe — see the last case below.
 */

const U64 = 2n ** 64n;

class Rejected extends Error {}

/** `mul_div`, including its own assertion that the product fits in 64 bits unsigned. */
function mulDiv(x: bigint, y: bigint, denominator: bigint): bigint {
	const product = x * y;

	if (product >= U64) {
		throw new Rejected("the product's high word is not zero");
	}

	return product / denominator;
}

const applyBasisPoints = (amount: bigint, bps: bigint) => mulDiv(amount, bps, 10_000n);

function contractDebt(principal: bigint, rate: bigint): bigint {
	const sum = principal + applyBasisPoints(principal, rate);

	if (sum >= U64) {
		throw new Rejected("the sum carries out of 64 bits");
	}

	return sum;
}

const contractProtocolFee = (principal: bigint, rate: bigint) =>
	applyBasisPoints(applyBasisPoints(principal, rate), 1_000n);

/** The three formulas the deployed document writes, character for character. */
const DEBT =
	"params.PRINCIPAL_AMOUNT + params.PRINCIPAL_AMOUNT * params.PRINCIPAL_INTEREST_RATE / 10000";
const PROTOCOL_FEE =
	"instance.PRINCIPAL_AMOUNT * instance.PRINCIPAL_INTEREST_RATE / 10000 * 1000 / 10000";
const LENDER_VAULT =
	"instance.CURRENT_DEBT - instance.PRINCIPAL_AMOUNT * instance.PRINCIPAL_INTEREST_RATE / 10000 * 1000 / 10000";

function wallet(text: string, values: Record<string, string>): bigint | string {
	const found = evaluateExpression(text, "compileParam", { instance: values, params: values });

	return found.ok ? found.value : found.reason;
}

const amounts = (principal: bigint, rate: bigint) => ({
	PRINCIPAL_AMOUNT: String(principal),
	PRINCIPAL_INTEREST_RATE: String(rate),
});

/**
 * Inputs chosen so truncation decides the answer rather than merely occurring.
 *
 * Three of these produce a fee below one unit, where a runtime rounding to nearest or carrying
 * a fraction between the two divisions would differ from the contract by a whole unit.
 */
const CASES: [bigint, bigint][] = [
	[50_000n, 500n],
	[1n, 1n],
	[3n, 3333n],
	[7n, 9999n],
	[199_999n, 1n],
	[1_000_000_007n, 9_999n],
	[0n, 5_000n],
	[100_000n, 0n],
];

describe("the debt a created deployment records", () => {
	for (const [principal, rate] of CASES) {
		test(`agrees with the contract for ${principal} at ${rate} basis points`, () => {
			expect(wallet(DEBT, amounts(principal, rate))).toBe(contractDebt(principal, rate));
		});
	}
});

describe("the protocol fee and the lender's share", () => {
	for (const [principal, rate] of CASES) {
		test(`agree with the contract for ${principal} at ${rate} basis points`, () => {
			const fee = contractProtocolFee(principal, rate);

			expect(wallet(PROTOCOL_FEE, amounts(principal, rate))).toBe(fee);
			expect(
				wallet(LENDER_VAULT, {
					...amounts(principal, rate),
					CURRENT_DEBT: String(contractDebt(principal, rate)),
				}),
			).toBe(contractDebt(principal, rate) - fee);
		});
	}
});

/**
 * The failure this comparison exists to catch, shown rather than described.
 *
 * `a * b / c * d / e` is five terms and four operators, and the contract's own nesting —
 * `mul_div(mul_div(a, b, c), d, e)` — is exactly one of the ways to group them. Grouped any
 * other way the same inputs give a different number, and every one of those numbers is a
 * perfectly good `u64` that the covenant would reject after signing.
 */
describe("the grouping the contract's nesting fixes", () => {
	const values = amounts(50_000n, 500n);

	test("left to right within one precedence level is the contract's answer", () => {
		expect(wallet(PROTOCOL_FEE, values)).toBe(contractProtocolFee(50_000n, 500n));
		expect(wallet(PROTOCOL_FEE, values)).toBe(250n);
	});

	test("every other grouping of the same operators is a different number", () => {
		expect(
			wallet(
				"instance.PRINCIPAL_AMOUNT * instance.PRINCIPAL_INTEREST_RATE / (10000 * 1000) / 10000",
				values,
			),
		).toBe(0n);
		expect(
			wallet(
				"instance.PRINCIPAL_AMOUNT * instance.PRINCIPAL_INTEREST_RATE / (10000 * 1000 / 10000)",
				values,
			),
		).toBe(25_000n);
		expect(
			wallet(
				"instance.PRINCIPAL_AMOUNT * (instance.PRINCIPAL_INTEREST_RATE / 10000) * 1000 / 10000",
				values,
			),
		).toBe(0n);
	});
});

/**
 * Where the two do not agree, and why that direction is the safe one.
 *
 * The contract works unsigned and admits a product up to 2^64; this runtime holds every
 * intermediate in signed 64 bits and admits one up to 2^63. So there is a band of inputs the
 * contract would accept and this refuses, and no band where this produces a number the contract
 * would reject. A refusal before signing is recoverable; a covenant rejecting a signed
 * transaction is not, and says nothing about why.
 */
describe("the range the two do not share", () => {
	test("a product past the signed bound refuses here and would have been accepted there", () => {
		const values = amounts(2n ** 32n, 2n ** 31n);

		expect(contractProtocolFee(2n ** 32n, 2n ** 31n)).toBe(92_233_720_368_547n);
		expect(wallet(PROTOCOL_FEE, values)).toContain("64-bit range");
	});

	test("a product past the unsigned bound is refused by both", () => {
		const values = amounts(2n ** 32n, 2n ** 32n);

		expect(() => contractProtocolFee(2n ** 32n, 2n ** 32n)).toThrow(Rejected);
		expect(wallet(PROTOCOL_FEE, values)).toContain("64-bit range");
	});
});
