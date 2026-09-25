import { describe, expect, test } from "bun:test";

import debugVaultlet from "../__fixtures__/vaultlet-debug.manifest.json";
import groupedVaultlet from "../__fixtures__/vaultlet.manifest.json";
import { normaliseManifest } from "./normalise";

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

	test("records having read the newer spelling under the older name", () => {
		expect(
			normaliseManifest(debugVaultlet as unknown as Record<string, unknown>).notes,
		).toContainEqual({
			at: "manifest",
			canonical: "compile_debug_symbols",
			found: "simplicity_hl.debug_symbols",
		});
	});

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

	test("two spellings declaring opposite modes", () => {
		const found = declaring({
			compile_debug_symbols: false,
			simplicity_hl: { debug_symbols: true },
		});

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("opposite modes");
	});
});
