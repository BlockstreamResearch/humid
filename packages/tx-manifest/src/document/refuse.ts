import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

import { encodeHex } from "../chain/hex";
import { STATIC_WITNESS } from "../evaluation/witness";
import { Refusal } from "../refusal";
import type { Manifest } from "./manifest";
import { RESERVED_INPUT_IDS } from "./references";
import type { Witness } from "./schema";

const CAPABILITIES = new Set(["simplicity"]);

export function refuseUnsupported(
	manifest: Manifest,
	input: { compilerVersion?: string; contractSources: Record<string, string> },
): Refusal | undefined {
	return (
		refuseReservedInputIds(manifest) ??
		refuseCapabilities(manifest) ??
		refuseUnbuildableUtxoType(manifest) ??
		refuseSourceMismatch(manifest, input.contractSources) ??
		refuseForeignCompiler(manifest, input) ??
		refuseUnproducibleWitness(manifest)
	);
}

function refuseReservedInputIds(manifest: Manifest): Refusal | undefined {
	for (const action of manifest.actions) {
		const reserved = action.inputs.find(({ id }) => id !== undefined && RESERVED_INPUT_IDS.has(id));

		if (reserved !== undefined) {
			return new Refusal(
				`The manifest is malformed: ${action.name} names an input "${reserved.label}", which is a namespace.`,
			);
		}
	}

	return undefined;
}

function refuseCapabilities(manifest: Manifest): Refusal | undefined {
	const missing = manifest.requires.find((capability) => !CAPABILITIES.has(capability));

	return missing === undefined
		? undefined
		: new Refusal(
				`This protocol requires ${JSON.stringify(missing)}, which this wallet does not provide.`,
				"unimplemented-construct",
			);
}

function refuseUnbuildableUtxoType(manifest: Manifest): Refusal | undefined {
	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const scriptType = declared.script.type;

		if (scriptType !== undefined && scriptType !== "simplicity") {
			return new Refusal(
				`The ${name} contract is a ${scriptType} script, and this wallet builds Simplicity programs.`,
				"unbuildable-utxo-type",
			);
		}
	}

	return undefined;
}

function refuseSourceMismatch(
	manifest: Manifest,
	contractSources: Record<string, string>,
): Refusal | undefined {
	for (const { at, hash, path } of programReferences(manifest)) {
		const source = contractSources[path];

		if (hash === undefined || source === undefined) {
			continue;
		}

		if (hash !== `sha256:${encodeHex(sha256(utf8ToBytes(source)))}`) {
			return new Refusal(
				`The contract at ${path} is not the one ${at} pins with ${hash}.`,
				"source-mismatch",
			);
		}
	}

	return undefined;
}

function refuseForeignCompiler(
	manifest: Manifest,
	input: { compilerVersion?: string; contractSources: Record<string, string> },
): Refusal | undefined {
	const shipped = input.compilerVersion;

	if (shipped === undefined) {
		return undefined;
	}

	for (const { at, path, range } of programReferences(manifest)) {
		const source = input.contractSources[path];
		const directive = source === undefined ? undefined : simcDirective(source);

		for (const required of [range ?? manifest.simplicityHl.version, directive]) {
			if (required !== undefined && !satisfies(shipped, required)) {
				return new Refusal(
					`The contract at ${path}, used by ${at}, asks for SimplicityHL ${required}, and this wallet compiles with ${shipped}.`,
					"foreign-compiler",
				);
			}
		}
	}

	return undefined;
}

function refuseUnproducibleWitness(manifest: Manifest): Refusal | undefined {
	for (const action of manifest.actions) {
		for (const input of action.inputs) {
			for (const [name, witness] of Object.entries(input.witnesses)) {
				const reason = unproducible(witness);

				if (reason) {
					return new Refusal(
						`The witness ${name} at ${action.name} / input ${input.label} ${reason}.`,
						"unproducible-witness",
					);
				}
			}
		}
	}

	return undefined;
}

function unproducible(witness: Witness): string | undefined {
	if (witness === "unused") {
		return undefined;
	}

	if (witness.type === STATIC_WITNESS) {
		return witness.value === undefined ? "states no value" : undefined;
	}

	if (witness.type !== "Signature") {
		return `is a ${witness.type}, and this wallet only produces signatures and stated values`;
	}

	if (witness.source?.type !== "wallet") {
		return "is a signature from a key this wallet does not hold";
	}

	return witness.sig_type === undefined || witness.sig_type === "sig_hash_all"
		? undefined
		: `asks for ${witness.sig_type}, and this wallet signs over the whole transaction`;
}

type ProgramReference = { at: string; hash?: string; path: string; range?: string };

function programReferences(manifest: Manifest): ProgramReference[] {
	const scripts = Object.entries(manifest.utxoTypes).map(([name, { script }]) => ({
		at: `the ${name} contract`,
		hash: script.source_hash,
		path: script.source,
		range: script.simplicity_hl_version,
	}));
	const computes = manifest.actions.flatMap((action) =>
		[
			...Object.entries(action.create_instance?.fields ?? {}),
			...Object.entries(action.params).map(([name, param]) => [name, param.compute] as const),
		].flatMap(([name, compute]) =>
			typeof compute !== "object" || compute.simf === undefined
				? []
				: [
						{
							at: `${action.name} / ${name}`,
							hash: compute.simf_hash,
							path: compute.simf,
							range: compute.simplicity_hl_version,
						},
					],
		),
	);

	return [...scripts, ...computes];
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
