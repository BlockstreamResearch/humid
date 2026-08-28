import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import manifestJson from "../__fixtures__/current/lending_v3.manifest.json";
import groupedManifestJson from "../__fixtures__/lending_v3.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import { buildMode } from "../document/refuse";
import { deriveCovenantAddress } from "./covenant";
import { declaredParamTypes } from "./declaredTypes";

/**
 * One covenant of a live protocol, built from its own published document.
 *
 * `issuance_factory` is the one covenant in the corpus whose deployed scriptPubKey is written
 * down: the document states that for the deployed `(2, 0)` it is the fixed
 * `5120456881785cc7d561caaa059e02f1a2823066bd860423996bea3e92c621bb064b`, and says that value
 * was reproduced from the contract source. It is also the covenant whose whole address is two
 * integers, which is exactly what nothing here could encode.
 *
 * **What this file proves and what it does not.** It proves that this runtime, reading the
 * published document, asks the compiler for precisely those two arguments — the string below,
 * character for character. That the compiler turns that string into the deployed script is
 * proved separately and against the real wasm module, in
 * `adapters/smplx/deployedCovenant.test.ts`, because this package deliberately has no compiler
 * of its own: a wallet supplies one. The two halves share the argument string, so a change to
 * either end breaks one of them.
 *
 * The transaction around this covenant is not built here and cannot be yet — both actions that
 * name it deploy a new instance, and a deployment's fields are worked out from issuances that
 * do not exist until the transaction does. That is a different gap and it is somebody else's.
 */

/**
 * What the compiler is asked for, once the document has been read.
 *
 * Not a hexadecimal digit anywhere. Both values are written as decimal, because
 * `0x2` is not a `u8` the compiler will parse and `0x0000000000000002` is the same number by
 * luck rather than by rule — for a larger value the two spellings are different numbers and
 * both compile.
 */
const ARGUMENTS =
	'{"ISSUING_UTXOS_COUNT":{"type":"u8","value":"2"},"REISSUANCE_FLAGS":{"type":"u64","value":"0"}}';

/** The deployed factory's parameters, as the document's own defaults state them. */
const DEPLOYED = { ISSUING_UTXOS_COUNT: "2", REISSUANCE_FLAGS: "0" };

const SOURCE_PATH = "./issuance_factory.simf";
const SOURCE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../__fixtures__/contracts/issuance_factory.simf"),
	"utf8",
);

const { manifest } = normaliseManifest(manifestJson as unknown as Record<string, unknown>);

/** The same protocol as its authors published it before the container was renamed. */
const grouped = normaliseManifest(
	groupedManifestJson as unknown as Record<string, unknown>,
).manifest;

/** Records what it was asked to compile. The real compiler is driven in the adapter's own test. */
function recorder() {
	const calls: { argumentsJson: string; includeDebugSymbols: boolean; source: string }[] = [];

	return {
		calls,
		compile: (input: { argumentsJson: string; includeDebugSymbols: boolean; source: string }) => {
			calls.push(input);

			return { address: "ex1p_recorded", scriptPubKeyHex: `5120${"00".repeat(32)}` };
		},
	};
}

async function derive(
	action: string,
	scope: { instance: Record<string, string>; params: Record<string, string> },
	document = manifest,
) {
	const found = findAction(document, action);

	if (!found) {
		throw new Error(`This fixture declares no action named ${action}.`);
	}

	const { calls, compile } = recorder();
	const result = await deriveCovenantAddress(document, {
		compile,
		contractSources: { [SOURCE_PATH]: SOURCE },
		declaredTypes: declaredParamTypes(document, found),
		includeDebugSymbols: buildMode(document),
		network: "liquid",
		scope,
		utxoType: "issuance_factory",
		wiring: {},
	});

	return { calls, result };
}

describe("a live protocol's factory covenant", () => {
	test("is built from parameters its constructor declares", async () => {
		const { calls, result } = await derive("CreateFactory", { instance: {}, params: DEPLOYED });

		expect(result.ok).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.argumentsJson).toBe(ARGUMENTS);
	});

	/**
	 * The same covenant, reached by an action that declares none of these as its own. Every
	 * value comes off the deployment, and until the deployment's declarations were read there
	 * was no type to encode against and therefore no address to compare anything to.
	 */
	test("and from the same parameters when a later action reads them off the deployment", async () => {
		const { calls, result } = await derive("CreateOffer", { instance: DEPLOYED, params: {} });

		expect(result.ok).toBe(true);
		expect(calls[0]?.argumentsJson).toBe(ARGUMENTS);
	});

	/**
	 * The document says its contracts were built with debug symbols, and that changes the
	 * commitment root and therefore the address. Asserted here because the argument string
	 * alone does not reproduce the deployed script without it.
	 */
	test("in the mode the document says its contracts were built in", async () => {
		const { calls } = await derive("CreateFactory", { instance: {}, params: DEPLOYED });

		expect(calls[0]?.includeDebugSymbols).toBe(true);
	});

	test("and from the contract source the request supplied, not one of its own", async () => {
		const { calls } = await derive("CreateFactory", { instance: {}, params: DEPLOYED });

		expect(calls[0]?.source).toBe(SOURCE);
	});

	/**
	 * The same protocol, published again before its container was renamed. Both generations of
	 * it sit in the corpus, and the deployed factory is one covenant rather than two — so a
	 * runtime that read only the newer document would refuse the older one against money that
	 * is demonstrably there.
	 */
	test("and identically from the generation that spells its container the older way", async () => {
		const { calls, result } = await derive(
			"CreateOffer",
			{ instance: DEPLOYED, params: {} },
			grouped,
		);

		expect(result.ok).toBe(true);
		expect(calls[0]?.argumentsJson).toBe(ARGUMENTS);
		expect(calls[0]?.includeDebugSymbols).toBe(true);
	});
});

describe("what it refuses rather than getting wrong", () => {
	test("a count too large for the width the document declared it at", async () => {
		const { calls, result } = await derive("CreateFactory", {
			instance: {},
			params: { ...DEPLOYED, ISSUING_UTXOS_COUNT: "256" },
		});

		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
		expect(result.ok ? "" : result.reason).toContain("0 to 255");
	});

	test("a value nobody supplied, rather than compiling with a default of its own", async () => {
		const { calls, result } = await derive("CreateOffer", { instance: {}, params: {} });

		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
});
