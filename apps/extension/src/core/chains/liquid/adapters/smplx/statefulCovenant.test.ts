import { describe, expect, test } from "bun:test";

import { encodeStateLeaves } from "@humid/tx-manifest";

import { smplx } from "./smplxWasmForTests";

const SOURCE = "fn main() { }";
const NETWORK = "liquidtestnet";

const DEBT = (owed: string) => ({
	payload: [{ align: "right", endian: "be", pad_to: 32, type: "u64", value: owed }],
	type: "tapdata",
});

const DISCRIMINATOR = (byte: string) => ({
	payload: [`0x${"00".repeat(31)}${byte}`],
	type: "tapdata",
});

function encode(declared: unknown[], instance: Record<string, string> = {}) {
	const encoded = encodeStateLeaves(declared, {
		at: "a contract",
		scope: { instance, params: {} },
	});

	if (!encoded.ok) {
		throw new Error(encoded.reason);
	}

	return encoded.leaves;
}

function compiled(leaves?: string[]) {
	const covenant = new smplx.Covenant(
		SOURCE,
		undefined,
		leaves === undefined ? undefined : JSON.stringify(leaves),
		false,
	);

	try {
		return {
			address: covenant.address(NETWORK),
			cmr: covenant.commitmentMerkleRoot(),
			tapleafHash: covenant.tapleafHash(),
		};
	} finally {
		covenant.free();
	}
}

describe("the state this wallet encodes, against the address the compiler builds from it", () => {
	test("what the wallet encodes is what the compiler takes", () => {
		const leaves = encode([DISCRIMINATOR("00"), DEBT("1000")]);

		expect(leaves).toEqual([`${"00".repeat(32)}`, `${"00".repeat(24)}00000000000003e8`]);
		expect(compiled(leaves).address).toMatch(/^tex1p/);
	});

	test("a contract with state sits somewhere else than the same contract without", () => {
		const stateful = compiled(encode([DISCRIMINATOR("00"), DEBT("1000")]));

		expect(stateful.address).not.toBe(compiled().address);
	});

	test("and changing one value moves it again", () => {
		const owing = compiled(encode([DISCRIMINATOR("00"), DEBT("1000")]));
		const repaid = compiled(encode([DISCRIMINATOR("00"), DEBT("600")]));

		expect(owing.address).not.toBe(repaid.address);
	});

	test("as does the byte that says a loan has been taken up", () => {
		const offered = compiled(encode([DISCRIMINATOR("00"), DEBT("1000")]));
		const active = compiled(encode([DISCRIMINATOR("01"), DEBT("1000")]));

		expect(offered.address).not.toBe(active.address);
	});

	test("while the contract itself is the same contract throughout", () => {
		const one = compiled(encode([DISCRIMINATOR("00"), DEBT("1000")]));
		const other = compiled(encode([DISCRIMINATOR("01"), DEBT("600")]));

		expect(one.cmr).toBe(other.cmr);
		expect(one.tapleafHash).toBe(other.tapleafHash);
	});

	test("a value read through the deployment lands where a literal would", () => {
		const read = encode([DEBT("instance.CURRENT_DEBT")], { CURRENT_DEBT: "1000" });

		expect(read).toEqual(encode([DEBT("1000")]));
	});

	test("a leaf that is not a full slot is refused before it reaches the compiler", () => {
		const encoded = encodeStateLeaves([{ payload: ["0x00"], type: "tapdata" }], {
			at: "a contract",
			scope: { instance: {}, params: {} },
		});

		expect(encoded.ok).toBe(false);
	});

	test("and refused by the compiler too, were it ever to get there", () => {
		expect(() => compiled(["00"])).toThrow();
	});
});
