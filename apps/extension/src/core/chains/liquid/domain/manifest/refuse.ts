import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";
import { loadBearing, inspectConstructs } from "./registry";

export type Refusal = { reason: string };

/**
 * Every reason this runtime will not build an action, checked before anything is built.
 *
 * The rule is the format's own rather than house style: a tool that does not implement an
 * extension must reject a manifest using its fields rather than ignore them. What is added
 * here is that a refusal is a refusal — none of these returns a warning, and there is no
 * shape of this function that a person could click through.
 */
export function refuseUnsupported(
	manifest: NormalisedManifest,
	input: {
		compilerVersion: string;
		contractSources: Record<string, string>;
		/** The asset this wallet pays fees in and is the only one it moves today. */
		policyAsset: string;
	},
): Refusal | undefined {
	return (
		refuseForeignChain(manifest) ??
		refuseUnrecognisedConstruct(manifest) ??
		refuseForeignCompiler(manifest, input) ??
		refuseUnreadableBuildMode(manifest) ??
		refuseUnproducibleWitness(manifest) ??
		refuseForeignAsset(manifest, input.policyAsset) ??
		refuseUnbuildableUtxoType(manifest, input.policyAsset)
	);
}

/**
 * Whether this protocol's contracts are built with debug symbols.
 *
 * The flag changes the CMR and therefore the covenant address, so the wallet follows the
 * mode the protocol states and builds plainly when it states nothing. That is not a hole in
 * the address check: whatever a site declares, the wallet rebuilds the contract and refuses
 * unless the result matches where the funds actually sit, so a misdeclared mode produces a
 * refusal rather than an exploit. It decides what the wallet computes, never what it
 * compares against — which is why no user-facing setting governs it and none exists.
 */
export function buildMode(manifest: NormalisedManifest): boolean {
	return manifest.node.compile_debug_symbols === true;
}

/**
 * A protocol for a chain this wallet does not build on.
 *
 * `chain` names the network family rather than one of its networks — every published
 * manifest says `liquid`, and a protocol is not written twice for testnet and mainnet — so
 * this checks the family and leaves which Liquid network to the wallet's own configuration.
 * A manifest naming anything else describes a transaction this wallet cannot make.
 */
function refuseForeignChain(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.chain;

	if (declared === undefined || (typeof declared === "string" && LIQUID_CHAINS.has(declared))) {
		return undefined;
	}

	return {
		reason:
			`This protocol is for ${JSON.stringify(declared)}, and this wallet builds Liquid ` +
			"transactions.",
	};
}

/** The names a Liquid protocol's `chain` can carry. */
const LIQUID_CHAINS = new Set(["elements", "elements-regtest", "liquid", "liquid-testnet"]);

/**
 * The first construct the runtime does not act on in a position where being wrong could
 * change what gets signed.
 *
 * One at a time rather than all of them: the reader of this message is deciding whether to
 * trust a site, and a list of eleven field names is not more useful than the first.
 */
function refuseUnrecognisedConstruct(manifest: NormalisedManifest): Refusal | undefined {
	const found = loadBearing(inspectConstructs(manifest))[0];

	if (!found) {
		return undefined;
	}

	return {
		reason: found.declared
			? `This protocol uses "${found.key}" at ${found.at}, which this wallet does not implement. ` +
				"It will not sign a transaction built from a document it has only partly read."
			: `This protocol uses "${found.key}" at ${found.at}, which this wallet does not recognise. ` +
				"It will not sign a transaction built from a document it has only partly read.",
	};
}

/**
 * A compiler version other than the one compiled into this wallet.
 *
 * Exactly one version ships, as a crate inside the signing module rather than as anything
 * fetched, so there is no allowlist and nothing to revoke — and a manifest asking for
 * another version cannot be honoured at all, because a different compiler derives a
 * different address for the same contract.
 *
 * Two channels declare it and both are checked against the same version, so there is no
 * precedence to define. Silence in both proceeds: four of the seven published manifests
 * declare nothing, and refusing them would be refusing for a reason unrelated to trust.
 */
function refuseForeignCompiler(
	manifest: NormalisedManifest,
	input: { compilerVersion: string; contractSources: Record<string, string> },
): Refusal | undefined {
	const declared = manifest.node.simplicity_hl_version;

	if (typeof declared === "string" && declared !== input.compilerVersion) {
		return {
			reason:
				`This protocol asks for SimplicityHL ${declared} and this wallet has ` +
				`${input.compilerVersion}. A different compiler derives a different address for the ` +
				"same contract, so there is nothing safe to build.",
		};
	}

	for (const [path, source] of Object.entries(input.contractSources)) {
		const range = simcDirective(source);

		if (range !== undefined && !satisfies(input.compilerVersion, range)) {
			return {
				reason:
					`The contract at ${path} asks for SimplicityHL ${range} and this wallet has ` +
					`${input.compilerVersion}.`,
			};
		}
	}

	return undefined;
}

/** A declared build mode that is neither on nor off says nothing this wallet can follow. */
function refuseUnreadableBuildMode(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.compile_debug_symbols;

	if (declared === undefined || typeof declared === "boolean") {
		return undefined;
	}

	return {
		reason:
			`This protocol declares compile_debug_symbols as ${JSON.stringify(declared)}, which is ` +
			"neither on nor off. The wallet builds each contract the way its protocol states, and " +
			"cannot follow a statement it cannot read.",
	};
}

/**
 * A witness this runtime cannot produce.
 *
 * The registry says the three keys are read; reading them is not the same as honouring every
 * value they can hold. A `simplicityhl` witness is a value the site computes and we do not,
 * a source other than the wallet is a key we do not hold, and a sighash type other than the
 * one we sign is a signature over something else. Each of those, signed as if it had said
 * what we can do, is a signature over a transaction nobody agreed to.
 */
function refuseUnproducibleWitness(manifest: NormalisedManifest): Refusal | undefined {
	for (const action of manifest.actions) {
		for (const declared of asArray(action.node.inputs)) {
			const input = asRecord(declared);
			const id = typeof input?.id === "string" ? input.id : "(unnamed)";

			for (const [name, entry] of Object.entries(asRecord(input?.witnesses) ?? {})) {
				const witness = asRecord(entry);
				const at = `${action.name} / input ${id} / witness ${name}`;

				if (witness?.type !== "Signature") {
					return {
						reason:
							`The witness ${name} at ${at} is a ${String(witness?.type)}, and this wallet ` +
							"can only produce a signature.",
					};
				}

				const source = asRecord(witness.source)?.type;

				if (source !== "wallet") {
					return {
						reason:
							`The witness ${name} at ${at} is sourced from ${String(source)}, and this ` +
							"wallet can only sign with a key it holds.",
					};
				}

				const sigType = witness.sig_type;

				if (sigType !== undefined && sigType !== "sig_hash_all") {
					return {
						reason:
							`The witness ${name} at ${at} asks for ${String(sigType)}, and this wallet ` +
							"signs over the whole transaction.",
					};
				}
			}
		}
	}

	return undefined;
}

/**
 * An input or output in an asset this wallet does not move.
 *
 * Only the policy asset today. An input naming another asset would be funded from L-BTC and
 * an output in another asset would be paid in L-BTC, and neither is a smaller version of
 * what the manifest asked for — it is a different transaction.
 */
function refuseForeignAsset(
	manifest: NormalisedManifest,
	policyAsset: string,
): Refusal | undefined {
	const allowed = new Set(["lbtc", policyAsset.toLowerCase()]);

	for (const action of manifest.actions) {
		for (const kind of ["inputs", "outputs"] as const) {
			for (const declared of asArray(action.node[kind])) {
				const entry = asRecord(declared);
				const asset = entry?.asset;

				if (typeof asset === "string" && !allowed.has(asset.toLowerCase())) {
					const id = typeof entry?.id === "string" ? entry.id : "(unnamed)";

					return {
						reason:
							`${action.name} moves ${asset} at ${id}, and this wallet moves only the ` +
							"network's own asset.",
					};
				}
			}
		}
	}

	return undefined;
}

/**
 * A utxo type this wallet cannot build or spend.
 *
 * Three things about one, and each is a value the wallet would otherwise act on as if it had
 * said something else: a script that is not a Simplicity program, a covenant declared
 * confidential — which Simplicity cannot read, so the program could never introspect its own
 * value — and an asset the wallet does not move.
 */
function refuseUnbuildableUtxoType(
	manifest: NormalisedManifest,
	policyAsset: string,
): Refusal | undefined {
	const allowed = new Set(["lbtc", policyAsset.toLowerCase()]);

	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const utxoType = asRecord(declared);
		const scriptType = asRecord(utxoType?.script)?.type;

		if (scriptType !== undefined && scriptType !== "simplicity") {
			return {
				reason:
					`The ${name} contract is a ${String(scriptType)} script, and this wallet builds ` +
					"Simplicity covenants.",
			};
		}

		if (utxoType?.confidential === true) {
			return {
				reason:
					`The ${name} covenant is declared confidential. A Simplicity program cannot read a ` +
					"confidential commitment, so it could never check its own value.",
			};
		}

		const asset = utxoType?.asset;

		if (typeof asset === "string" && !allowed.has(asset.toLowerCase())) {
			return {
				reason:
					`The ${name} covenant holds ${asset}, and this wallet moves only the network's own ` +
					"asset.",
			};
		}
	}

	return undefined;
}

/** The `simc "<range>"` directive a contract source may open with. */
function simcDirective(source: string): string | undefined {
	return /(?:^|\n)\s*simc\s+"(?<range>[^"]+)"/.exec(source)?.groups?.range;
}

/**
 * Whether the shipped version satisfies what a source asks for.
 *
 * Deliberately narrow: an exact version, or a `>=` lower bound, which is what the corpus
 * and upstream's own documentation use. Any other syntax is not interpreted generously —
 * an unparsed range is treated as unsatisfied, because guessing at a constraint that
 * decides whether an address can be derived is the failure this refusal exists to prevent.
 */
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
