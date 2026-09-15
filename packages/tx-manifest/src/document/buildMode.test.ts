import { describe, expect, test } from "bun:test";

import debugVaultlet from "../__fixtures__/vaultlet-debug.manifest.json";
import groupedVaultlet from "../__fixtures__/vaultlet.manifest.json";
import { normaliseManifest } from "./normalise";

/**
 * Which mode a protocol says its contracts were built in, read rather than assumed.
 *
 * The flag changes the commitment merkle root, so the identical document with and without it
 * describes covenants at two different addresses — and both compile. A wallet that ignored it
 * would derive a well-formed address for a contract nobody deployed, then refuse against the
 * money that is actually there and say the site had lied.
 */

const mode = (document: unknown) =>
	normaliseManifest(document as Record<string, unknown>).manifest.buildMode;

const declaring = (declared: Record<string, unknown>) =>
	mode({ actions: {}, protocol: "p", ...declared });

describe("the two spellings a protocol states it in", () => {
	test("reads the flat one the older generation writes", () => {
		expect(declaring({ compile_debug_symbols: true })).toEqual({
			includeDebugSymbols: true,
			ok: true,
		});
	});

	test("and the block the newer generation moved it into", () => {
		expect(mode(debugVaultlet)).toEqual({ includeDebugSymbols: true, ok: true });
	});

	/** A rewrite is never silent, here least of all: this one decides an address. */
	test("records having read the newer spelling under the older name", () => {
		expect(
			normaliseManifest(debugVaultlet as unknown as Record<string, unknown>).notes,
		).toContainEqual({
			at: "manifest",
			canonical: "compile_debug_symbols",
			found: "simplicity_hl.debug_symbols",
		});
	});

	/**
	 * A document saying nothing is built plainly. That is not a hole in the address check: the
	 * wallet still rebuilds the contract and refuses unless the result matches where the funds
	 * actually sit, so the mode decides what is computed and never what it is compared against.
	 */
	test("builds plainly where a document states nothing", () => {
		expect(mode(groupedVaultlet)).toEqual({ includeDebugSymbols: false, ok: true });
		expect(declaring({ compile_debug_symbols: false })).toEqual({
			includeDebugSymbols: false,
			ok: true,
		});
	});

	test("takes the older spelling where a document carries both and they agree", () => {
		expect(
			declaring({ compile_debug_symbols: true, simplicity_hl: { debug_symbols: true } }),
		).toEqual({ includeDebugSymbols: true, ok: true });
	});
});

describe("what it refuses rather than picking a mode", () => {
	/** There is no third mode to build in, so a statement that is neither is not a statement. */
	test("a declaration that is neither on nor off", () => {
		const found = declaring({ compile_debug_symbols: "yes" });

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("neither on nor off");
	});

	test("the same, written in the newer block", () => {
		const found = declaring({ simplicity_hl: { debug_symbols: 1 } });

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("simplicity_hl.debug_symbols");
	});

	/**
	 * Two statements that disagree are the same problem written twice. The document says both
	 * modes, the two produce different addresses, and nothing in the format says which spelling
	 * wins — so following either would be this wallet deciding what the protocol meant.
	 */
	test("two spellings declaring opposite modes", () => {
		const found = declaring({
			compile_debug_symbols: false,
			simplicity_hl: { debug_symbols: true },
		});

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("opposite modes");
	});
});
