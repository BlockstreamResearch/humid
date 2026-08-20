import { beforeAll, describe, expect, test } from "bun:test";

import { contractSource, smplx } from "./smplxWasmForTests";

/**
 * The compiler end of the parameters a deployment writes as bare values.
 *
 * `tx-manifest` proves that reading a live protocol's published document produces exactly the
 * argument strings below, and that every value in them was typed by a declaration rather than by
 * its appearance. It holds no compiler, by design. This proves the declarations it was typed
 * against are the compiler's own, and that the strings build a covenant.
 *
 * **Where the type comes from, and why it has to be asked for.** `SimplicityHL` has no syntax
 * that declares a compile parameter's type. `param::NAME` is written where a value is wanted and
 * the type checker gives it the type that position demands — `simplicityhl` 0.6.0 inserts the
 * parameter into the program's global map under the expected type of the expression it stands in
 * for (`src/ast.rs` L1346-1350). So there is no declaration in the source to read: the type is a
 * result of analysing the source, and the compiler is the only thing that can state it.
 *
 * **Nothing here was compared against a chain.** The published document records a deployed
 * scriptPubKey for its factory and for none of these, and the asset ids are invented, so these
 * addresses are reproducible rather than confirmed. Confirming one needs a deployed instance of
 * these covenants whose script is either published or readable from Liquid.
 */

const MIDDLE = "00".repeat(30);
const ZERO_HASH = "00".repeat(32);

/** Kept character for character identical to `tx-manifest`'s own copy. */
const PRINCIPAL_ASSET_AUTH =
	`{"ASSET_ID":{"type":"u256","value":"0x0b${MIDDLE}b0"},` +
	'"ASSET_AMOUNT":{"type":"u64","value":"1"},' +
	'"WITH_ASSET_BURN":{"type":"bool","value":"false"}}';

const LENDER_VAULT_FINALIZED =
	`{"VAULT_ASSET_ID":{"type":"u256","value":"0x0a${MIDDLE}a0"},` +
	`"KEEPER_AUTH_ASSET_ID":{"type":"u256","value":"0x0c${MIDDLE}c0"},` +
	`"SUPPLIER_AUTH_ASSET_ID":{"type":"u256","value":"0x0b${MIDDLE}b0"},` +
	'"KEEPER_AUTH_ASSET_AMOUNT":{"type":"u64","value":"1"},' +
	`"FINALIZED_VAULT_COV_HASH":{"type":"u256","value":"0x${ZERO_HASH}"},` +
	'"IS_ACTIVE":{"type":"bool","value":"false"},' +
	'"WITH_KEEPER_ASSET_BURN":{"type":"bool","value":"true"},' +
	'"WITH_SUPPLIER_ASSET_BURN":{"type":"bool","value":"true"}}';

const PROTOCOL_FEE_VAULT_FINALIZED = LENDER_VAULT_FINALIZED.replace(
	'"WITH_KEEPER_ASSET_BURN":{"type":"bool","value":"true"}',
	'"WITH_KEEPER_ASSET_BURN":{"type":"bool","value":"false"}',
).replace(
	`"KEEPER_AUTH_ASSET_ID":{"type":"u256","value":"0x0c${MIDDLE}c0"}`,
	`"KEEPER_AUTH_ASSET_ID":{"type":"u256","value":"0x0d${MIDDLE}d0"}`,
);

/** The document says its contracts were built with debug symbols, and that changes the address. */
const DEBUG_SYMBOLS = true;

let assetAuth = "";
let assetAuthVault = "";

beforeAll(async () => {
	assetAuth = await contractSource("asset_auth.simf");
	assetAuthVault = await contractSource("asset_auth_vault.simf");
});

function scriptPubKeyFor(source: string, argumentsJson: string): string {
	const contract = new smplx.Contract(source, argumentsJson, "[]", DEBUG_SYMBOLS);
	const script = contract.scriptPubKeyHex("liquid");

	contract.free();

	return script;
}

describe("what the contracts declare their parameters to be", () => {
	test("asset_auth declares a count, an id and a flag", () => {
		expect(JSON.parse(smplx.contractParameterTypes(assetAuth))).toEqual({
			ASSET_AMOUNT: "u64",
			ASSET_ID: "u256",
			WITH_ASSET_BURN: "bool",
		});
	});

	test("asset_auth_vault declares three flags among its eight", () => {
		expect(JSON.parse(smplx.contractParameterTypes(assetAuthVault))).toEqual({
			FINALIZED_VAULT_COV_HASH: "u256",
			IS_ACTIVE: "bool",
			KEEPER_AUTH_ASSET_AMOUNT: "u64",
			KEEPER_AUTH_ASSET_ID: "u256",
			SUPPLIER_AUTH_ASSET_ID: "u256",
			VAULT_ASSET_ID: "u256",
			WITH_KEEPER_ASSET_BURN: "bool",
			WITH_SUPPLIER_ASSET_BURN: "bool",
		});
	});

	/**
	 * The reading needs no arguments, which is the whole point of it: the arguments cannot be
	 * built until the types are known, so anything that had to be given them first would be
	 * circular. Asserted against a contract whose parameters nothing here supplies.
	 */
	test("and are readable from the source alone, with no arguments supplied", async () => {
		expect(
			JSON.parse(smplx.contractParameterTypes(await contractSource("lending.simf"))),
		).toMatchObject({ LOAN_EXPIRATION_TIME: "u32", PRINCIPAL_AMOUNT: "u64" });
	});

	test("a source that is not a program is refused rather than answered", () => {
		expect(() => smplx.contractParameterTypes("fn main() { this is not simplicity }")).toThrow();
	});
});

describe("the argument strings tx-manifest builds from those declarations", () => {
	test("build the covenant behind claiming the principal", () => {
		expect(scriptPubKeyFor(assetAuth, PRINCIPAL_ASSET_AUTH)).toMatch(/^5120[0-9a-f]{64}$/);
	});

	test("build the lender's finalised vault", () => {
		expect(scriptPubKeyFor(assetAuthVault, LENDER_VAULT_FINALIZED)).toMatch(/^5120[0-9a-f]{64}$/);
	});

	test("build the protocol fee's finalised vault", () => {
		expect(scriptPubKeyFor(assetAuthVault, PROTOCOL_FEE_VAULT_FINALIZED)).toMatch(
			/^5120[0-9a-f]{64}$/,
		);
	});

	/**
	 * The two vaults differ by one word in the document. If a flag were read as a flag rather
	 * than as the type its contract declares, both would still compile — to the same address for
	 * one of them and the wrong address for the other.
	 */
	test("and the two vaults are different covenants, because one flag differs", () => {
		expect(scriptPubKeyFor(assetAuthVault, LENDER_VAULT_FINALIZED)).not.toBe(
			scriptPubKeyFor(assetAuthVault, PROTOCOL_FEE_VAULT_FINALIZED),
		);
	});
});

/**
 * Why the width had to be asked for rather than picked.
 *
 * A count of one fits every integer type there is, so nothing about the value narrows it. What
 * saves a wrong pick from being silent is that the compiler requires an argument's type to equal
 * its parameter's exactly — but "saved by a refusal deep in the compiler" is not the same as
 * knowing, and the refusal names neither the document nor the parameter.
 */
describe("the widths that would have been wrong", () => {
	for (const wrong of ["u8", "u16", "u32", "u128", "u256"]) {
		test(`the same count declared ${wrong} does not build a covenant at all`, () => {
			const mutated = PRINCIPAL_ASSET_AUTH.replace(
				'"ASSET_AMOUNT":{"type":"u64","value":"1"}',
				`"ASSET_AMOUNT":{"type":"${wrong}","value":"1"}`,
			);

			expect(() => scriptPubKeyFor(assetAuth, mutated)).toThrow();
		});
	}

	test("and a flag given an integer type instead of its own is refused too", () => {
		const mutated = PRINCIPAL_ASSET_AUTH.replace(
			'"WITH_ASSET_BURN":{"type":"bool","value":"false"}',
			'"WITH_ASSET_BURN":{"type":"u8","value":"0"}',
		);

		expect(() => scriptPubKeyFor(assetAuth, mutated)).toThrow();
	});

	/**
	 * The half that is not saved by a refusal. Both words are legal `bool`, so setting the wrong
	 * one compiles, derives an address, and reports nothing — which is why the word is read from
	 * the document and never defaulted.
	 */
	test("but the wrong word for a flag is silent, and a different covenant", () => {
		const flipped = PRINCIPAL_ASSET_AUTH.replace(
			'"WITH_ASSET_BURN":{"type":"bool","value":"false"}',
			'"WITH_ASSET_BURN":{"type":"bool","value":"true"}',
		);

		expect(scriptPubKeyFor(assetAuth, flipped)).toMatch(/^5120[0-9a-f]{64}$/);
		expect(scriptPubKeyFor(assetAuth, flipped)).not.toBe(
			scriptPubKeyFor(assetAuth, PRINCIPAL_ASSET_AUTH),
		);
	});
});
