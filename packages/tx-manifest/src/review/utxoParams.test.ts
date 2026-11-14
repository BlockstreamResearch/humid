import { describe, expect, test } from "bun:test";

import type { ParsedLiquidProcessCtParams } from "../request/request";
import { abiOf, type Document, Fixture, PUBKEY, refused, reviewed, TXID } from "./reviewForTests";

const PUB_KEY_ARGUMENT = JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } });
const programAbi = (source: string) => abiOf(source, { PUB_KEY: "u256" });

type P2pk = {
	actions: {
		Pay: { outputs: [{ destination: Document }] };
		Receive: { inputs: [{ utxo_source: Document }] };
	};
	utxo_types: { p2pk_output: { params?: Document; script: Document } };
};

const p2pkOf = (manifest: Document) => manifest as unknown as P2pk;

function closed(
	param: Document = { type: "pubkey" },
	bind: (reference: Document) => void = (reference) => {
		reference.args = { PUB_KEY: "params.pubkey" };
	},
): Fixture {
	return Fixture.load("p2pk").edited((manifest) => {
		const { actions, utxo_types: types } = p2pkOf(manifest);

		types.p2pk_output.params = { PUB_KEY: param };

		for (const reference of [
			actions.Pay.outputs[0].destination,
			actions.Receive.inputs[0].utxo_source,
		]) {
			delete reference.compile_params;
			bind(reference);
		}
	});
}

const pay = (fixture: Fixture, overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	fixture.request("Pay", { params: { amount_sat: 1000, pubkey: PUBKEY }, ...overrides });

const receive = (fixture: Fixture) =>
	fixture.request("Receive", {
		params: { pubkey: PUBKEY },
		state: { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] },
	});

describe("a utxo type that declares its params", () => {
	test("is built from what each input and output binds, as the open form builds it from the action", async () => {
		const paid = await reviewed(pay(closed()), { programAbi });
		const received = await reviewed(receive(closed()), { programAbi });

		expect(paid.programs[0]?.argumentsJson).toBe(PUB_KEY_ARGUMENT);
		expect(received.programInputs[0]?.argumentsJson).toBe(PUB_KEY_ARGUMENT);
	});

	test("falls back to a param's default where an output binds nothing", async () => {
		const fixture = closed({ default: PUBKEY, type: "pubkey" }, () => {});

		expect((await reviewed(pay(fixture), { programAbi })).programs[0]?.argumentsJson).toBe(
			PUB_KEY_ARGUMENT,
		);
	});

	test("hands its leaves its own params and nothing from the action", async () => {
		const leafReading = (value: string) =>
			closed().edited((manifest) => {
				p2pkOf(manifest).utxo_types.p2pk_output.script.extra_leaves = [
					{ payload: [{ endian: "be", type: "pubkey", value }], type: "tapdata" },
				];
			});

		await reviewed(pay(leafReading("params.PUB_KEY")), { programAbi });
		expect((await refused(pay(leafReading("params.pubkey")), { programAbi })).reason).toContain(
			"pubkey",
		);
	});
});

describe("what a closed utxo type refuses rather than deriving some address", () => {
	const cases: [string, Fixture, string][] = [
		[
			"a param no input or output binds and nothing defaults",
			closed(undefined, () => {}),
			"no default",
		],
		[
			"an output binding a param the type does not declare",
			closed(undefined, (reference) => {
				reference.args = { PUB_KEY: "params.pubkey", PUBKEY: "params.pubkey" };
			}),
			"PUBKEY",
		],
		[
			"a default reading the action rather than the deployment",
			closed({ default: "params.pubkey", type: "pubkey" }, () => {}),
			"only instance fields",
		],
		[
			"an output handing it compile_params instead of args",
			closed(undefined, (reference) => {
				reference.compile_params = { PUB_KEY: "params.pubkey" };
			}),
			"args",
		],
		[
			"args on a type that declares no params",
			Fixture.load("p2pk").edited((manifest) => {
				p2pkOf(manifest).actions.Pay.outputs[0].destination.args = { PUB_KEY: "params.pubkey" };
			}),
			"declares no params",
		],
	];

	for (const [what, fixture, named] of cases) {
		test(what, async () => {
			const refusal = await refused(pay(fixture), { programAbi });

			expect(refusal.reject).toBe("document-fault");
			expect(refusal.reason).toContain(named);
		});
	}
});
