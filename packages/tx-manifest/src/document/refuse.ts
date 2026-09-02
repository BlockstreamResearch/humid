import { STATIC_WITNESS } from "../evaluation/witness";
import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";
import { inspectConstructs, loadBearing } from "./registry";

/**
 * What a refusal is called, so that a program can tell two of them apart.
 *
 * The sentence is for a person and is unchanged by this. The token is for the site that
 * asked: without one, every refusal arrives as a single wire code and a paragraph of English,
 * so "this wallet does not implement `sequence`" and "your state file names no output to
 * spend" are indistinguishable to anything but a reader — and the first is permanent while
 * the second is the site's to fix.
 *
 * Short, stable, lower-case and hyphenated, after BIP-22's reject reasons. The vocabulary is
 * ours rather than the format's: txManifest defines error codes for the validation rules a
 * manifest itself declares, and none of these are that. They are the wallet's own statements
 * about what it will not do.
 */
export type RejectToken =
	/** The protocol is for a chain this wallet does not build on. */
	| "foreign-chain"
	/** A construct the format defines, in a load-bearing position, that this wallet does not implement. */
	| "unimplemented-construct"
	/** A construct in a load-bearing position that no specification this wallet knows describes. */
	| "unrecognised-construct"
	/** The manifest or a contract source asks for a compiler this wallet does not ship. */
	| "foreign-compiler"
	/** A declared build mode that is neither on nor off. */
	| "unreadable-build-mode"
	/** A witness this wallet cannot produce: not a signature, not its key, or not its sighash. */
	| "unproducible-witness"
	/** An input or output in an asset this wallet cannot establish or cannot move. */
	| "foreign-asset"
	/** A covenant this wallet cannot build or spend. */
	| "unbuildable-utxo-type"
	/** An input or output that cannot land at the transaction position it states. */
	| "unbuildable-position"
	/** The request is missing something the chosen action actually references. */
	| "incomplete-request"
	/** The manifest declares no action by that name. */
	| "no-such-action"
	/** The state file names no output for a covenant the action spends. */
	| "no-utxo-to-spend"
	/** The chain could not be read, so what sits at an outpoint is unknown. */
	| "chain-read-failed"
	/** A covenant the wallet rebuilt does not match what the chain says holds the money. */
	| "covenant-mismatch"
	/** The wallet could not establish a fee rate, and will not build without one. */
	| "no-fee-rate"
	/** Nothing spendable sits at the one address this action pins its funding to. */
	| "no-funds-at-signing-address"
	/** The wallet holds less than the action needs, in the form the action can spend. */
	| "shortfall"
	/** An expression, encoding or protocol rule the manifest states could not be satisfied. */
	| "document-fault"
	/**
	 * The signing module's account of what it built is not what the wallet agreed to.
	 *
	 * Nothing a site can correct and never worth retrying: the document was read, the action
	 * resolved, and the person may already have approved. What failed is the agreement between
	 * the wallet and the module underneath it, and the wallet returns nothing rather than a
	 * transaction it cannot vouch for.
	 */
	| "built-something-else";

export type Refusal = {
	reason: string;
	reject: RejectToken;
};

/**
 * Every reason this runtime will not build an action, checked before anything is built.
 *
 * The rule is the format's own rather than house style: a tool that does not implement an
 * extension must reject a manifest using its fields rather than ignore them. What is added
 * here is that a refusal is a refusal — none of these returns a warning, and there is no
 * shape of this function a person could click through.
 *
 * What is deliberately absent is any statement about which asset an action moves. This wallet
 * funds an action asset by asset out of what it holds in each, so an asset the document names
 * is a question about a balance rather than about the document, and it is answered where the
 * balance is — as a shortfall naming the asset, or as a lookup that would not resolve.
 */
export function refuseUnsupported(
	manifest: NormalisedManifest,
	input: {
		/**
		 * The version of SimplicityHL this wallet ships, when the caller holds one.
		 *
		 * Optional because this package compiles nothing itself: the compiler arrives as a
		 * function, and a caller that has not said which version stands behind it gets the
		 * check skipped rather than answered against a stand-in. Passing one would turn "not
		 * checked" into "checked and fine", which is the one thing this must not do.
		 */
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

/**
 * A protocol for a chain this wallet does not build on.
 *
 * `chain` names the network family rather than one of its networks — every published manifest
 * says `liquid`, and a protocol is not written twice for testnet and mainnet — so this checks
 * the family and leaves which Liquid network to the wallet's own configuration. A manifest
 * naming anything else describes a transaction this wallet cannot make.
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
		reject: "foreign-chain",
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
		reason:
			`This protocol uses "${found.key}" at ${found.at}, which this wallet does not ` +
			`${found.declared ? "implement" : "recognise"}. It will not sign a transaction built ` +
			"from a document it has only partly read.",
		reject: found.declared ? "unimplemented-construct" : "unrecognised-construct",
	};
}

/**
 * A compiler version other than the one this wallet ships.
 *
 * A different compiler derives a different address for the same contract, so a manifest asking
 * for another version cannot be honoured at all. Two channels declare it — the document's own
 * field and a `simc` directive inside each contract source — and both are checked against the
 * same version, so there is no precedence to define. Silence in both proceeds: most published
 * manifests declare nothing, and refusing them would be refusing for a reason unrelated to
 * trust.
 */
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

/**
 * A witness this runtime cannot produce.
 *
 * The table says the witness keys are read; reading them is not the same as honouring every
 * value they can hold. A stated value is one the site computes and this wallet hands on as
 * text, a source other than the wallet is a key it does not hold, and a sighash type other
 * than the one it signs is a signature over something else. Each of those, signed as if it
 * had said what this wallet can do, is a signature over a transaction nobody agreed to.
 */
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
	// A value the document states outright is produced rather than signed: the type and the
	// literal travel to the compiler as text, which is the component that parses SimplicityHL.
	// Both have to be there — a stated value missing its type is a witness nothing can check.
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

/**
 * A utxo type this wallet cannot build or spend.
 *
 * Two things about one, and each is a value the wallet would otherwise act on as if it had
 * said something else: a script that is not a Simplicity program, and a covenant declared
 * confidential — which Simplicity cannot read, so the program could never introspect its own
 * value.
 *
 * Which asset a covenant holds is not among them. This wallet funds and nets each asset on its
 * own, so a covenant in something other than the network's asset is a covenant it accounts for
 * rather than one it cannot build.
 */
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

/** The `simc "<range>"` directive a contract source may open with. */
function simcDirective(source: string): string | undefined {
	return /(?:^|\n)\s*simc\s+"(?<range>[^"]+)"/.exec(source)?.groups?.range;
}

/**
 * Whether the shipped version satisfies what a source asks for.
 *
 * Deliberately narrow: an exact version, or a `>=` lower bound, which is what the corpus and
 * upstream's own documentation use. Any other syntax is not interpreted generously — an
 * unparsed range is treated as unsatisfied, because guessing at a constraint that decides
 * whether an address can be derived is the failure this refusal exists to prevent.
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
