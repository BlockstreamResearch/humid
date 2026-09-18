import { STATIC_WITNESS } from "../evaluation/witness";
import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";
import { inspectConstructs, loadBearing } from "./registry";
import { contractSourcePaths } from "./sites";

export type RejectToken =
	| "foreign-chain"
	| "unimplemented-construct"
	| "unrecognised-construct"
	| "foreign-compiler"
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

export function refuseUnsupported(
	manifest: NormalisedManifest,
	input: {
		compilerVersion?: string;
		contractSources: Record<string, string>;
	},
): Refusal | undefined {
	return (
		refuseForeignChain(manifest) ??
		refuseUnrecognisedConstruct(manifest) ??
		refuseForeignCompiler(manifest, input) ??
		refuseUnproducibleWitness(manifest) ??
		refuseUnbuildableUtxoType(manifest)
	);
}

export const DOCUMENT_ONLY_REJECTS = [
	"foreign-chain",
	"unimplemented-construct",
	"unrecognised-construct",
	"foreign-compiler",
	"unproducible-witness",
	"unbuildable-utxo-type",
	"unreadable-build-mode",
] as const satisfies readonly RejectToken[];

export const NEEDS_MORE_THAN_THE_DOCUMENT_REJECTS = [
	"foreign-asset",
	"incomplete-request",
	"no-such-action",
	"no-utxo-to-spend",
	"chain-read-failed",
	"covenant-mismatch",
	"no-fee-rate",
	"no-funds-at-signing-address",
	"shortfall",
	"unbuildable-position",
	"document-fault",
	"built-something-else",
] as const satisfies readonly RejectToken[];

export type PartialCheck = {
	reject: RejectToken;
	unread: string[];
};

export function refuseFromDocumentAlone(
	manifest: NormalisedManifest,
	input: {
		compilerVersion?: string;
		contractSources?: Record<string, string>;
	},
): { partial: PartialCheck[]; refusal: Refusal | undefined; skipped: RejectToken[] } {
	const skipped: RejectToken[] = [];
	const partial: PartialCheck[] = [];

	const compiler =
		input.compilerVersion === undefined
			? undefined
			: refuseForeignCompiler(manifest, {
					compilerVersion: input.compilerVersion,
					contractSources: input.contractSources ?? {},
				});

	if (input.compilerVersion === undefined) {
		skipped.push("foreign-compiler");
	} else {
		const supplied = input.contractSources ?? {};
		const unread = contractSourcePaths(manifest).filter((path) => !(path in supplied));

		if (unread.length > 0) {
			partial.push({ reject: "foreign-compiler", unread });
		}
	}

	return {
		partial,
		refusal:
			refuseForeignChain(manifest) ??
			refuseUnrecognisedConstruct(manifest) ??
			compiler ??
			refuseUnproducibleWitness(manifest) ??
			refuseUnbuildableUtxoType(manifest) ??
			refuseUnreadableBuildMode(manifest),
		skipped,
	};
}

function refuseUnreadableBuildMode(manifest: NormalisedManifest): Refusal | undefined {
	if (manifest.buildMode.ok) {
		return undefined;
	}

	return { reason: manifest.buildMode.reason, reject: "unreadable-build-mode" };
}

function refuseForeignChain(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.chain;

	if (declared === undefined || (typeof declared === "string" && LIQUID_CHAINS.has(declared))) {
		return undefined;
	}

	return {
		reason:
			`This protocol is for ${JSON.stringify(declared)}, and this wallet builds Liquid ` +
			"transactions.",
		reject: "foreign-chain",
	};
}

const LIQUID_CHAINS = new Set(["elements", "elements-regtest", "liquid", "liquid-testnet"]);

function refuseUnrecognisedConstruct(manifest: NormalisedManifest): Refusal | undefined {
	const found = loadBearing(inspectConstructs(manifest))[0];

	if (!found) {
		return undefined;
	}

	return {
		reason:
			`This protocol uses "${found.key}" at ${found.at}, which this wallet does not ` +
			`${found.declared ? "implement" : "recognise"}. It will not sign a transaction built ` +
			"from a document it has only partly read.",
		reject: found.declared ? "unimplemented-construct" : "unrecognised-construct",
	};
}

function refuseForeignCompiler(
	manifest: NormalisedManifest,
	input: { compilerVersion?: string; contractSources: Record<string, string> },
): Refusal | undefined {
	const shipped = input.compilerVersion;

	if (shipped === undefined) {
		return undefined;
	}

	const declared = manifest.node.simplicity_hl_version;

	if (typeof declared === "string" && declared !== shipped) {
		return {
			reason:
				`This protocol asks for SimplicityHL ${declared} and this wallet has ${shipped}. A ` +
				"different compiler derives a different address for the same contract, so there is " +
				"nothing safe to build.",
			reject: "foreign-compiler",
		};
	}

	for (const [path, source] of Object.entries(input.contractSources)) {
		const range = simcDirective(source);

		if (range !== undefined && !satisfies(shipped, range)) {
			return {
				reason:
					`The contract at ${path} asks for SimplicityHL ${range} and this wallet has ` +
					`${shipped}.`,
				reject: "foreign-compiler",
			};
		}
	}

	return undefined;
}

function refuseUnproducibleWitness(manifest: NormalisedManifest): Refusal | undefined {
	for (const action of manifest.actions) {
		for (const declared of asArray(action.node.inputs)) {
			const input = asRecord(declared);
			const id = typeof input?.id === "string" ? input.id : "(unnamed)";

			for (const [name, entry] of Object.entries(asRecord(input?.witnesses) ?? {})) {
				const witness = asRecord(entry);
				const at = `${action.name} / input ${id} / witness ${name}`;
				const refusal = refuseOneWitness(witness, name, at);

				if (refusal) {
					return refusal;
				}
			}
		}
	}

	return undefined;
}

function refuseOneWitness(
	witness: Record<string, unknown> | undefined,
	name: string,
	at: string,
): Refusal | undefined {
	if (witness?.type === STATIC_WITNESS) {
		if (typeof witness.simplicity_type === "string" && typeof witness.value === "string") {
			return undefined;
		}

		return {
			reason:
				`The witness ${name} at ${at} states a value and ` +
				(typeof witness.simplicity_type === "string"
					? "no value to give it."
					: "no type to give it.") +
				" This wallet will not hand a contract a value nothing can type-check.",
			reject: "unproducible-witness",
		};
	}

	if (witness?.type !== "Signature") {
		return {
			reason:
				`The witness ${name} at ${at} is a ${String(witness?.type)}, and this wallet can only ` +
				"produce a signature.",
			reject: "unproducible-witness",
		};
	}

	const source = asRecord(witness.source)?.type;

	if (source !== "wallet") {
		return {
			reason:
				`The witness ${name} at ${at} is sourced from ${String(source)}, and this wallet can ` +
				"only sign with a key it holds.",
			reject: "unproducible-witness",
		};
	}

	const sigType = witness.sig_type;

	if (sigType !== undefined && sigType !== "sig_hash_all") {
		return {
			reason:
				`The witness ${name} at ${at} asks for ${String(sigType)}, and this wallet signs over ` +
				"the whole transaction.",
			reject: "unproducible-witness",
		};
	}

	return undefined;
}

function refuseUnbuildableUtxoType(manifest: NormalisedManifest): Refusal | undefined {
	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const utxoType = asRecord(declared);
		const scriptType = asRecord(utxoType?.script)?.type;

		if (scriptType !== undefined && scriptType !== "simplicity") {
			return {
				reason:
					`The ${name} contract is a ${String(scriptType)} script, and this wallet builds ` +
					"Simplicity covenants.",
				reject: "unbuildable-utxo-type",
			};
		}

		if (utxoType?.confidential === true) {
			return {
				reason:
					`The ${name} covenant is declared confidential. A Simplicity program cannot read a ` +
					"confidential commitment, so it could never check its own value.",
				reject: "unbuildable-utxo-type",
			};
		}
	}

	return undefined;
}

function simcDirective(source: string): string | undefined {
	return /(?:^|\n)\s*simc\s+"(?<range>[^"]+)"/.exec(source)?.groups?.range;
}

function satisfies(shipped: string, range: string): boolean {
	const trimmed = range.trim();
	const lowerBound = /^>=\s*(?<version>[0-9]+(?:\.[0-9]+){0,2})$/.exec(trimmed)?.groups?.version;

	if (lowerBound !== undefined) {
		return compare(shipped, lowerBound) >= 0;
	}

	return trimmed === shipped;
}

function compare(left: string, right: string): number {
	const one = left.split(".").map(Number);
	const other = right.split(".").map(Number);

	for (let at = 0; at < Math.max(one.length, other.length); at += 1) {
		const difference = (one[at] ?? 0) - (other[at] ?? 0);

		if (difference !== 0) {
			return difference;
		}
	}

	return 0;
}
