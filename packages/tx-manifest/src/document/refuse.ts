import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { STATIC_WITNESS } from "../evaluation/witness";
import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";
import { inspectConstructs } from "./registry";

export type RejectToken =
	| "foreign-chain"
	| "foreign-format"
	| "unimplemented-construct"
	| "foreign-compiler"
	| "source-mismatch"
	| "unreadable-build-mode"
	| "unproducible-witness"
	| "foreign-asset"
	| "unbuildable-utxo-type"
	| "unbuildable-position"
	| "incomplete-request"
	| "no-such-action"
	| "no-utxo-to-spend"
	| "chain-read-failed"
	| "covenant-mismatch"
	| "no-fee-rate"
	| "no-funds-at-signing-address"
	| "shortfall"
	| "document-fault"
	| "built-something-else";

export type Refusal = {
	reason: string;
	reject: RejectToken;
};

const FORMAT_MAJOR = 0;
const FORMAT_MINOR = 3;
const CHAINS = new Set(["elements", "liquid"]);
const CAPABILITIES = new Set(["simplicity"]);

export function refuseUnsupported(
	manifest: NormalisedManifest,
	input: { compilerVersion?: string; contractSources: Record<string, string> },
): Refusal | undefined {
	return (
		refuseForeignFormat(manifest) ??
		refuseForeignChain(manifest) ??
		refuseConstructs(manifest) ??
		refuseCapabilities(manifest) ??
		refuseUnbuildableUtxoType(manifest) ??
		refuseSourceMismatch(manifest, input.contractSources) ??
		refuseForeignCompiler(manifest, input) ??
		refuseUnproducibleWitness(manifest)
	);
}

function refuseForeignFormat(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.manifest_version;
	const [major, minor] = typeof declared === "string" ? declared.split(".").map(Number) : [];

	if (major === FORMAT_MAJOR && minor === FORMAT_MINOR) {
		return undefined;
	}

	return {
		reason: `This document is written in manifest format ${JSON.stringify(declared)}, and this wallet reads ${FORMAT_MAJOR}.${FORMAT_MINOR}.`,
		reject: "foreign-format",
	};
}

function refuseForeignChain(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.chain;

	if (declared === undefined || (typeof declared === "string" && CHAINS.has(declared))) {
		return undefined;
	}

	return {
		reason: `This protocol is for ${JSON.stringify(declared)}, and this wallet builds Liquid transactions.`,
		reject: "foreign-chain",
	};
}

function refuseConstructs(manifest: NormalisedManifest): Refusal | undefined {
	const found = inspectConstructs(manifest)[0];

	if (!found) {
		return undefined;
	}

	return found.state === "unimplemented"
		? {
				reason: `This protocol uses "${found.key}" at ${found.at}, which this wallet does not implement yet.`,
				reject: "unimplemented-construct",
			}
		: {
				reason: `The manifest is malformed: the format defines no "${found.key}" at ${found.at}.`,
				reject: "document-fault",
			};
}

function refuseCapabilities(manifest: NormalisedManifest): Refusal | undefined {
	const missing = asArray(manifest.node.requires).find(
		(capability) => typeof capability !== "string" || !CAPABILITIES.has(capability),
	);

	return missing === undefined
		? undefined
		: {
				reason: `This protocol requires ${JSON.stringify(missing)}, which this wallet does not provide.`,
				reject: "unimplemented-construct",
			};
}

function refuseUnbuildableUtxoType(manifest: NormalisedManifest): Refusal | undefined {
	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const scriptType = asRecord(asRecord(declared)?.script)?.type;

		if (scriptType !== undefined && scriptType !== "simplicity") {
			return {
				reason: `The ${name} contract is a ${String(scriptType)} script, and this wallet builds Simplicity covenants.`,
				reject: "unbuildable-utxo-type",
			};
		}
	}

	return undefined;
}

function refuseSourceMismatch(
	manifest: NormalisedManifest,
	contractSources: Record<string, string>,
): Refusal | undefined {
	for (const [name, script] of scripts(manifest)) {
		const path = script.source;
		const declared = script.source_hash;
		const source = typeof path === "string" ? contractSources[path] : undefined;

		if (declared === undefined || source === undefined) {
			continue;
		}

		if (declared !== `sha256:${bytesToHex(sha256(utf8ToBytes(source)))}`) {
			return {
				reason: `The contract at ${String(path)} is not the one the ${name} contract pins with ${String(declared)}.`,
				reject: "source-mismatch",
			};
		}
	}

	return undefined;
}

function refuseForeignCompiler(
	manifest: NormalisedManifest,
	input: { compilerVersion?: string; contractSources: Record<string, string> },
): Refusal | undefined {
	const shipped = input.compilerVersion;

	if (shipped === undefined) {
		return undefined;
	}

	const documentRange = asRecord(manifest.node.simplicity_hl)?.version;

	for (const [name, script] of scripts(manifest)) {
		const range = script.simplicity_hl_version ?? documentRange;
		const source =
			typeof script.source === "string" ? input.contractSources[script.source] : undefined;
		const directive = source === undefined ? undefined : simcDirective(source);

		for (const required of [range, directive]) {
			if (typeof required === "string" && !satisfies(shipped, required)) {
				return {
					reason: `The ${name} contract asks for SimplicityHL ${required}, and this wallet compiles with ${shipped}.`,
					reject: "foreign-compiler",
				};
			}
		}
	}

	return undefined;
}

function refuseUnproducibleWitness(manifest: NormalisedManifest): Refusal | undefined {
	for (const action of manifest.actions) {
		for (const declared of asArray(action.node.inputs)) {
			const input = asRecord(declared);
			const id = typeof input?.id === "string" ? input.id : "(unnamed)";

			for (const [name, witness] of Object.entries(asRecord(input?.witnesses) ?? {})) {
				const reason = witness === "unused" ? undefined : unproducible(asRecord(witness));

				if (reason) {
					return {
						reason: `The witness ${name} at ${action.name} / input ${id} ${reason}.`,
						reject: "unproducible-witness",
					};
				}
			}
		}
	}

	return undefined;
}

function unproducible(witness: Record<string, unknown> | undefined): string | undefined {
	if (witness?.type === STATIC_WITNESS) {
		return typeof witness.simplicity_type === "string" && typeof witness.value === "string"
			? undefined
			: "states a value without both a type and a value";
	}

	if (witness?.type !== "Signature") {
		return `is a ${String(witness?.type)}, and this wallet only produces signatures and stated values`;
	}

	if (asRecord(witness.source)?.type !== "wallet") {
		return "is a signature from a key this wallet does not hold";
	}

	return witness.sig_type === undefined || witness.sig_type === "sig_hash_all"
		? undefined
		: `asks for ${String(witness.sig_type)}, and this wallet signs over the whole transaction`;
}

function scripts(manifest: NormalisedManifest): [string, Record<string, unknown>][] {
	return Object.entries(manifest.utxoTypes).flatMap(([name, declared]) => {
		const script = asRecord(asRecord(declared)?.script);

		return script ? [[name, script] as [string, Record<string, unknown>]] : [];
	});
}

function simcDirective(source: string): string | undefined {
	return /(?:^|\n)\s*simc\s+"(?<range>[^"]+)"/.exec(source)?.groups?.range;
}

export function satisfies(version: string, requirement: string): boolean {
	const shipped = parts(version);

	return requirement.split(",").every((comparator) => {
		const match = /^\s*(?<op>\^|~|=|>=|>|<=|<)?\s*(?<bound>\d+(?:\.\d+){0,2})\s*$/.exec(comparator);
		const op = match?.groups?.op ?? "^";
		const bound = match?.groups?.bound;

		if (!bound) {
			return false;
		}

		const lower = parts(bound);
		const order = compare(shipped, lower);

		switch (op) {
			case "=": {
				return order === 0;
			}
			case ">=": {
				return order >= 0;
			}
			case ">": {
				return order > 0;
			}
			case "<=": {
				return order <= 0;
			}
			case "<": {
				return order < 0;
			}
			default: {
				return order >= 0 && compare(shipped, upperBound(bound, op)) < 0;
			}
		}
	});
}

function upperBound(bound: string, op: string): number[] {
	const given = bound.split(".").map(Number);
	const [major = 0, minor = 0, patch = 0] = given;

	if (op === "~") {
		return given.length === 1 ? [major + 1, 0, 0] : [major, minor + 1, 0];
	}

	if (major > 0 || given.length === 1) {
		return [major + 1, 0, 0];
	}

	return minor > 0 || given.length === 2 ? [0, minor + 1, 0] : [0, 0, patch + 1];
}

function parts(version: string): number[] {
	const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);

	return [major, minor, patch];
}

function compare(left: number[], right: number[]): number {
	for (let at = 0; at < 3; at += 1) {
		const difference = (left[at] ?? 0) - (right[at] ?? 0);

		if (difference !== 0) {
			return difference;
		}
	}

	return 0;
}
