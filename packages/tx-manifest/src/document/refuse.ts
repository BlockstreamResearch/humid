import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { STATIC_WITNESS } from "../evaluation/witness";
import { Refusal } from "../refusal";
import { asArray, asRecord } from "./json";
import type { Manifest } from "./manifest";
import { RESERVED_INPUT_IDS } from "./references";
import { inspectConstructs } from "./registry";

const FORMAT_MAJOR = 0;
const FORMAT_MINOR = 3;
const CHAINS = new Set(["elements", "liquid"]);
const CAPABILITIES = new Set(["simplicity"]);

export function refuseUnsupported(
	manifest: Manifest,
	input: { compilerVersion?: string; contractSources: Record<string, string> },
): Refusal | undefined {
	return (
		refuseForeignFormat(manifest) ??
		refuseForeignChain(manifest) ??
		refuseConstructs(manifest) ??
		refuseReservedInputIds(manifest) ??
		refuseCapabilities(manifest) ??
		refuseUnbuildableUtxoType(manifest) ??
		refuseSourceMismatch(manifest, input.contractSources) ??
		refuseForeignCompiler(manifest, input) ??
		refuseUnproducibleWitness(manifest)
	);
}

function refuseForeignFormat(manifest: Manifest): Refusal | undefined {
	const declared = manifest.node.manifest_version;
	const [major, minor] = typeof declared === "string" ? declared.split(".").map(Number) : [];

	if (major === FORMAT_MAJOR && minor === FORMAT_MINOR) {
		return undefined;
	}

	return new Refusal(
		`This document is written in manifest format ${JSON.stringify(declared)}, and this wallet reads ${FORMAT_MAJOR}.${FORMAT_MINOR}.`,
		"foreign-format",
	);
}

function refuseForeignChain(manifest: Manifest): Refusal | undefined {
	const declared = manifest.node.chain;

	if (declared === undefined || (typeof declared === "string" && CHAINS.has(declared))) {
		return undefined;
	}

	return new Refusal(
		`This protocol is for ${JSON.stringify(declared)}, and this wallet builds Liquid transactions.`,
		"foreign-chain",
	);
}

function refuseConstructs(manifest: Manifest): Refusal | undefined {
	const found = inspectConstructs(manifest)[0];

	if (!found) {
		return undefined;
	}

	return found.state === "unimplemented"
		? new Refusal(
				`This protocol uses "${found.key}" at ${found.at}, which this wallet does not implement yet.`,
				"unimplemented-construct",
			)
		: new Refusal(
				`The manifest is malformed: the format defines no "${found.key}" at ${found.at}.`,
				"document-fault",
			);
}

function refuseReservedInputIds(manifest: Manifest): Refusal | undefined {
	for (const action of manifest.actions) {
		const reserved = asArray(action.node.inputs)
			.map((input) => asRecord(input)?.id)
			.find((id) => typeof id === "string" && RESERVED_INPUT_IDS.has(id));

		if (reserved !== undefined) {
			return new Refusal(
				`The manifest is malformed: ${action.name} names an input "${String(reserved)}", which is a namespace.`,
				"document-fault",
			);
		}
	}

	return undefined;
}

function refuseCapabilities(manifest: Manifest): Refusal | undefined {
	const missing = asArray(manifest.node.requires).find(
		(capability) => typeof capability !== "string" || !CAPABILITIES.has(capability),
	);

	return missing === undefined
		? undefined
		: new Refusal(
				`This protocol requires ${JSON.stringify(missing)}, which this wallet does not provide.`,
				"unimplemented-construct",
			);
}

function refuseUnbuildableUtxoType(manifest: Manifest): Refusal | undefined {
	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const scriptType = asRecord(asRecord(declared)?.script)?.type;

		if (scriptType !== undefined && scriptType !== "simplicity") {
			return new Refusal(
				`The ${name} contract is a ${String(scriptType)} script, and this wallet builds Simplicity programs.`,
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
		const source = typeof path === "string" ? contractSources[path] : undefined;

		if (hash === undefined || source === undefined) {
			continue;
		}

		if (hash !== `sha256:${bytesToHex(sha256(utf8ToBytes(source)))}`) {
			return new Refusal(
				`The contract at ${String(path)} is not the one ${at} pins with ${String(hash)}.`,
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

	const documentRange = asRecord(manifest.node.simplicity_hl)?.version;

	for (const { at, path, range } of programReferences(manifest)) {
		const source = typeof path === "string" ? input.contractSources[path] : undefined;
		const directive = source === undefined ? undefined : simcDirective(source);

		for (const required of [range ?? documentRange, directive]) {
			if (typeof required === "string" && !satisfies(shipped, required)) {
				return new Refusal(
					`The contract at ${String(path)}, used by ${at}, asks for SimplicityHL ${required}, and this wallet compiles with ${shipped}.`,
					"foreign-compiler",
				);
			}
		}
	}

	return undefined;
}

function refuseUnproducibleWitness(manifest: Manifest): Refusal | undefined {
	for (const action of manifest.actions) {
		for (const declared of asArray(action.node.inputs)) {
			const input = asRecord(declared);
			const id = typeof input?.id === "string" ? input.id : "(unnamed)";

			for (const [name, witness] of Object.entries(asRecord(input?.witnesses) ?? {})) {
				const reason = witness === "unused" ? undefined : unproducible(asRecord(witness));

				if (reason) {
					return new Refusal(
						`The witness ${name} at ${action.name} / input ${id} ${reason}.`,
						"unproducible-witness",
					);
				}
			}
		}
	}

	return undefined;
}

function unproducible(witness: Record<string, unknown> | undefined): string | undefined {
	if (witness?.type === STATIC_WITNESS) {
		return typeof witness.value === "string" ? undefined : "states no value";
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

type ProgramReference = { at: string; hash: unknown; path: unknown; range: unknown };

function programReferences(manifest: Manifest): ProgramReference[] {
	const scripts = Object.entries(manifest.utxoTypes).flatMap(([name, declared]) => {
		const script = asRecord(asRecord(declared)?.script);

		return script
			? [
					{
						at: `the ${name} contract`,
						hash: script.source_hash,
						path: script.source,
						range: script.simplicity_hl_version,
					},
				]
			: [];
	});
	const computes = manifest.actions.flatMap((action) =>
		[
			...Object.entries(asRecord(asRecord(action.node.create_instance)?.fields) ?? {}),
			...Object.entries(asRecord(action.node.params) ?? {}).map(
				([name, param]) => [name, asRecord(param)?.compute] as const,
			),
		].flatMap(([name, declared]) => {
			const compute = asRecord(declared);

			return compute?.simf === undefined
				? []
				: [
						{
							at: `${action.name} / ${name}`,
							hash: compute.simf_hash,
							path: compute.simf,
							range: compute.simplicity_hl_version,
						},
					];
		}),
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
